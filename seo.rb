# The crawlable side of the site, generated at deploy time from data.json: one real page per country that has an
# army or a navy at the start (its own title, description, canonical address, structured data and a plain-text
# summary of how it starts), a sitemap, and the list of country links the front page carries. The page itself is
# one app; these pages are the same app opened on a country, so a search for "Prussia Victoria 3 1836" can land on
# Prussia rather than on a hash.
#
#   ruby seo.rb <data.json> <index.html as deployed> <output dir>
#
# Writes <output dir>/index.html (the front page with its country links), <output dir>/country/<slug> (no
# extension: the deploy uploads them as text/html) and <output dir>/sitemap.xml. Needs only Ruby's standard library.
require "json"
require "cgi"
require "fileutils"
require "time"

Encoding.default_external = Encoding::UTF_8 # a CI runner may not have a UTF-8 locale
Encoding.default_internal = nil

SITE = "https://vic3tech.jane.berlin"
GAME = "Victoria 3"
SHORT = "Vic3"
YEAR = "1836"

data = JSON.parse(File.read(ARGV[0], encoding: "UTF-8"))
template = File.read(ARGV[1], encoding: "UTF-8")
out = ARGV[2]
countries = data["countries"]
techs = data["techs"].to_h { |t| [ t["id"], t ] }
laws = data["laws"]

def h(text) = CGI.escapeHTML(text.to_s)
def n0(x) = x.to_f.round.to_s.reverse.scan(/\d{1,3}/).join(",").reverse
def slugify(name) = name.unicode_normalize(:nfkd).gsub(/\p{Mn}/, "").downcase.gsub(/[^a-z0-9]+/, "-").gsub(/\A-|-\z/, "")
def count(n, one, many = "#{one}s") = "#{n0(n)} #{n.to_i == 1 ? one : many}"
def humanize(key) = key.to_s.tr("_", " ").capitalize

def battalions(c) = c["army"].values.sum { |u| u["count"] }
def ships(c) = c["navy"].values.sum { |u| u["count"] }

pages = countries.select { |c| battalions(c) + ships(c) > 0 }
                 .sort_by { |c| [ -(battalions(c) + ships(c) * 2), c["tier"], c["name"] ] }
used = {}
pages.each do |c|
  slug = slugify(c["name"])
  slug = "#{slug}-#{c["tag"].downcase}" if slug.empty? || used.key?(slug)
  used[slug] = c
  c["slug"] = slug
end
rank_of = pages.each_with_index.to_h { |c, i| [ c["tag"], i + 1 ] }

LAW_GROUPS = {
  "lawgroup_governance_principles" => "government", "lawgroup_distribution_of_power" => "who may vote",
  "lawgroup_economic_system" => "economy", "lawgroup_army_model" => "army", "lawgroup_slavery" => "slavery"
}.freeze

def forces(units)
  top = units.values.sort_by { |u| -u["count"] }.first(3).map { |u| "#{u["name"]} #{u["count"]}" }
  top.empty? ? "" : " (mostly #{top.join(", ")})"
end

def summary(c, techs, laws)
  mine = c["techs"].filter_map { |id| techs[id] }
  by_category = mine.group_by { |t| t["category"] }
  newest = mine.reject { |t| t["era"] == "era_1" }.map { |t| t["name"] }.first(6)
  facts = []
  facts << "#{c["name"]} (#{c["tag"]}) starts the #{YEAR} campaign of #{GAME} in tech tier #{c["tier"]}, in #{humanize(c["region"])}."
  chosen = c["laws"].filter_map { |id| (l = laws[id]) && (label = LAW_GROUPS[l["group"]]) && "#{label}: #{l["name"]}" }
  facts << "Its laws: #{chosen.join("; ")}." if chosen.any?
  facts << "It starts with #{mine.size} technologies (#{%w[production military society].map { |cat| "#{by_category.fetch(cat, []).size} #{cat}" }.join(", ")})" \
           "#{newest.any? ? ", among them #{newest.join(", ")}" : ""}."
  facts << "Its forces are #{count(battalions(c), "battalion")}#{forces(c["army"])} and #{count(ships(c), "ship")}#{forces(c["navy"])}."
  facts
end

def description(c)
  "#{c["name"]} at the #{YEAR} start of #{GAME}: tech tier #{c["tier"]}, #{count(battalions(c), "battalion")}, #{count(ships(c), "ship")} and its laws. Compare it with every other country."[0, 300]
end

# --- Rewrites of the page's own tags ---------------------------------------------------------------------------------
def retag(html, title:, description:, url:)
  html = html.sub(%r{<title>.*?</title>}m, "<title>#{h(title)}</title>")
  html = html.sub(/(<meta name="description" content=")[^"]*(")/, "\\1#{h(description)}\\2")
  html = html.sub(/(<link rel="canonical" href=")[^"]*(")/, "\\1#{url}\\2")
  html = html.sub(/(<meta property="og:url" content=")[^"]*(")/, "\\1#{url}\\2")
  html = html.gsub(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*(")/, "\\1#{h(title)}\\2")
  html.gsub(/(<meta (?:property="og:description"|name="twitter:description") content=")[^"]*(")/, "\\1#{h(description)}\\2")
end

def ld(obj) = %(<script type="application/ld+json">#{JSON.generate(obj).gsub("</", "<\\/")}</script>)

links_to = lambda do |list|
  list.map { |c| %(<a href="/country/#{c["slug"]}">#{h(c["name"])}</a>) }.join(" · ")
end

# The script a generated page carries so that its address and its "About" text stay honest: while the app shows the
# page's own item the address keeps the page's path; once the app moves on to another country (or culture, perk
# tree ...) the address becomes the app's normal /#... one and the About text, which was about the first, goes.
def entry_script(path:, key:, key_js:)
  <<~JS
    <script>
      (() => {
        const ENTRY = #{JSON.generate(key)}, PATH = #{JSON.generate(path)}, keyOf = #{key_js};
        const settle = (url) => {
          if (typeof url !== "string" || !url.includes("#")) return url;
          const hash = url.slice(url.indexOf("#"));
          if (hash.length < 2 || keyOf(hash) === ENTRY) return PATH + hash;
          document.querySelector(".seo-about")?.remove();
          return "/" + hash;
        };
        for (const m of ["replaceState", "pushState"]) {
          const original = history[m].bind(history);
          history[m] = (state, title, url) => original(state, title, settle(url));
        }
        const tidy = () => { if (location.hash.length > 1) history.replaceState(history.state, "", location.hash); };
        document.addEventListener("DOMContentLoaded", tidy);
        window.addEventListener("hashchange", tidy); // a link or an edited address, which don't go through the history calls above
      })();
    </script>
  JS
end

# --- A page per country ----------------------------------------------------------------------------------------------
FileUtils.mkdir_p(File.join(out, "country"))
pages.each do |c|
  i = rank_of[c["tag"]] - 1
  near = (pages[[ i - 6, 0 ].max...i] + pages[(i + 1)..(i + 6)].to_a)
  block = <<~HTML
    <details class="seo-about">
      <summary>About #{h(c["name"])} at the #{YEAR} start</summary>
      #{summary(c, techs, laws).map { |f| "<p>#{h(f)}</p>" }.join("\n      ")}
      <p>Similar in size: #{links_to.call(near)}. <a href="/">All countries</a>.</p>
    </details>
  HTML
  title = "#{c["name"]} in #{SHORT} (#{YEAR}): technologies, army, navy and laws – #{SHORT} Tech"
  url = "#{SITE}/country/#{c["slug"]}"
  html = retag(template, title: title, description: description(c), url: url)
  html = html.sub("<!--seo:about-->", block)
  key_js = '(h) => decodeURIComponent(h.slice(1)).split("/")[0].toUpperCase()'
  html = html.sub("<!--seo:head-->", %(<meta name="initial-tag" content="#{c["tag"]}">\n  ) + entry_script(path: "/country/#{c["slug"]}", key: c["tag"], key_js: key_js) + ld({
    "@context" => "https://schema.org", "@type" => "WebPage", "name" => title, "url" => url,
    "description" => description(c), "inLanguage" => "en",
    "isPartOf" => { "@type" => "WebSite", "name" => "#{SHORT} Tech", "url" => "#{SITE}/" },
    "about" => { "@type" => "Thing", "name" => "#{c["name"]} in #{GAME}" },
    "breadcrumb" => { "@type" => "BreadcrumbList", "itemListElement" => [
      { "@type" => "ListItem", "position" => 1, "name" => "#{SHORT} Tech", "item" => "#{SITE}/" },
      { "@type" => "ListItem", "position" => 2, "name" => c["name"], "item" => url }
    ] }
  }))
  File.write(File.join(out, "country", c["slug"]), html, encoding: "UTF-8")
end

# --- The front page: unchanged to look at, just without the markers ---
front = template.sub("<!--seo:about-->", "")
front = front.sub("<!--seo:head-->", "")
File.write(File.join(out, "index.html"), front, encoding: "UTF-8")

# --- Sitemap -------------------------------------------------------------------------------------------------------------
stamp = Time.parse(data["generated_at"].to_s).utc.strftime("%Y-%m-%d") rescue Time.now.utc.strftime("%Y-%m-%d")
urls = [ [ "#{SITE}/", "1.0" ] ] + pages.map { |c| [ "#{SITE}/country/#{c["slug"]}", rank_of[c["tag"]] <= 30 ? "0.8" : "0.6" ] }
File.write(File.join(out, "sitemap.xml"), <<~XML, encoding: "UTF-8")
  <?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  #{urls.map { |u, p| "  <url><loc>#{u}</loc><lastmod>#{stamp}</lastmod><priority>#{p}</priority></url>" }.join("\n")}
  </urlset>
XML
puts "SEO: #{pages.size} country pages, sitemap with #{urls.size} addresses"
