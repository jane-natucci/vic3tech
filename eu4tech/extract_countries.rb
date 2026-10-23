# Reads a local Europa Universalis IV install and writes eu4tech/countries.json (and a
# small flag PNG per country in eu4tech/flags/): for every country and every bookmark
# date, what it is made of at that start -- government, religion, ruler and heir with
# their adm/dip/mil, provinces and development, trade goods, rivals, friends and
# diplomatic ties -- straight from history/countries, history/provinces and
# history/diplomacy. Self-contained, like extract.rb.
#
#   ruby eu4tech/extract_countries.rb                  # default Steam install on macOS
#   ruby eu4tech/extract_countries.rb "/path/to/Europa Universalis IV"
#
# The output is Paradox's game data, so it's gitignored, never committed.
# Needs ImageMagick (`magick`) only for the flags.
require "json"
require "fileutils"
require "open3"
require "time"
require "set"

Encoding.default_external = Encoding::UTF_8

GAME = ARGV[0] || ENV.fetch("EU4_GAME_DIR",
  File.expand_path("~/Library/Application Support/Steam/steamapps/common/Europa Universalis IV"))
OUT = File.join(__dir__, "countries.json")
FLAGS = File.join(__dir__, "flags")
abort "No EU4 install at #{GAME} -- pass its path as the first argument." unless Dir.exist?(File.join(GAME, "history"))
FileUtils.mkdir_p(FLAGS)

# --- Paradox script ------------------------------------------------------------
def parse(text)
  # Comments are tokens of their own (a # can sit inside a multi-line string, so they can't be stripped first).
  tokens = text.scan(/#[^\n]*|"(?:[^"\\]|\\.)*"|[{}=]|[^\s{}=#]+/).reject { |t| t.start_with?("#") }
  pos = 0
  block = lambda do
    pairs = []
    while pos < tokens.size
      tok = tokens[pos]
      pos += 1
      return pairs if tok == "}"
      value = ->(t) { t == "{" ? block.call : t.delete('"') }
      if tokens[pos] == "="
        pos += 1
        nxt = tokens[pos]
        pos += 1
        pairs << [tok.delete('"'), value.call(nxt)]
      else
        pairs << [nil, value.call(tok)]
      end
    end
    pairs
  end
  block.call
end

# Script files are Windows-1252, except the newer ones that are UTF-8 (some with a BOM).
def read(path)
  raw = File.binread(path)
  utf8 = raw.dup.force_encoding("UTF-8")
  utf8.valid_encoding? ? utf8.sub(/\A\uFEFF/, "") : raw.force_encoding("windows-1252").encode("UTF-8", invalid: :replace, undef: :replace)
end
def read_utf8(path) = File.read(path, encoding: "bom|utf-8")
def get(block, key) = block.find { |k, _| k == key }&.last
def all(block, key) = block.select { |k, _| k == key }.map(&:last)
def date_key(text) = text.to_s.strip.split(".").map(&:to_i).then { |y, m, d| [ y || 0, m || 1, d || 1 ] }
def date?(key) = key.is_a?(String) && key.match?(/\A\d{1,4}\.\d{1,2}\.\d{1,2}\z/)

# --- English names -------------------------------------------------------------
NAMES = {}
Dir[File.join(GAME, "localisation", "*_l_english.yml")].sort.each do |f|
  read_utf8(f).scan(/^\s*([\w.]+):\d*\s+"(.*)"\s*$/) { |k, v| NAMES[k] ||= v }
end
def name_of(key)
  NAMES[key]&.gsub(/§[A-Za-z!]/, "")&.gsub(/\$[^$]*\$/, "")&.gsub(/\[[^\]]*\]/, "")&.gsub(/£\w+£?/, "")&.gsub('\n', " ")&.gsub(/\s+/, " ")&.strip
end

# --- Bookmarks: the start dates the game offers ----------------------------------
BOOKMARKS = Dir[File.join(GAME, "common/bookmarks/*.txt")].filter_map do |f|
  b = get(parse(read(f)), "bookmark") or next
  date = get(b, "date")
  date && date.to_s.match?(/\A\d+\.\d+\.\d+\z/) ? date : nil
end.uniq.sort_by { |d| date_key(d) }.freeze
abort "No bookmarks found" if BOOKMARKS.empty?

# --- Provinces: initial values, then dated changes ------------------------------------
# What is kept from a province's history. `owner` is what makes a country exist at a date.
PROVINCE_FIELDS = %w[owner base_tax base_production base_manpower trade_goods religion culture is_city hre capital].freeze
provinces = Dir[File.join(GAME, "history/provinces/*.txt")].filter_map do |f|
  id = File.basename(f)[/\A\d+/]&.to_i or next
  data = parse(read(f))
  initial = data.select { |k, v| PROVINCE_FIELDS.include?(k) && v.is_a?(String) }.to_h
  dated = data.select { |k, v| date?(k) && v.is_a?(Array) }.sort_by { |k, _| date_key(k) }
  changes = dated.map { |d, b| [ date_key(d), b.select { |k, v| PROVINCE_FIELDS.include?(k) && v.is_a?(String) }.to_h ] }
  { id: id, initial: initial, changes: changes }
end

def province_at(p, date)
  state = p[:initial].dup
  limit = date_key(date)
  p[:changes].each { |d, h| state.merge!(h) if (d <=> limit) <= 0 }
  state
end

# --- Countries: initial values, then dated changes ---------------------------------------
COUNTRY_FIELDS = %w[government technology_group religion primary_culture capital government_rank unit_type].freeze
countries = {}
Dir[File.join(GAME, "history/countries/*.txt")].sort.each do |f|
  tag = File.basename(f)[/\A[A-Z0-9]{3}/] or next
  data = parse(read(f))
  scalar = ->(b) { b.select { |k, v| COUNTRY_FIELDS.include?(k) && v.is_a?(String) }.to_h }
  lists = ->(b) { { reforms: all(b, "add_government_reform").grep(String), accepted: all(b, "add_accepted_culture").grep(String),
                    rivals: (all(b, "historical_rival") + all(b, "add_historical_rival")).grep(String),
                    friends: (all(b, "historical_friend") + all(b, "add_historical_friend")).grep(String) } }
  countries[tag] = {
    tag: tag, initial: scalar.call(data), lists: lists.call(data),
    changes: data.select { |k, v| date?(k) && v.is_a?(Array) }.sort_by { |k, _| date_key(k) }.map { |d, b|
      [ date_key(d), scalar.call(b), lists.call(b), { monarch: get(b, "monarch"), heir: get(b, "heir"), queen: get(b, "queen") } ]
    }
  }
end

# --- Diplomacy: ties with a start and an end date ---------------------------------------------
TIES = %w[alliance vassal march union dependency guarantee royal_marriage].freeze
ties = Dir[File.join(GAME, "history/diplomacy/*.txt")].flat_map do |f|
  parse(read(f)).filter_map do |type, b|
    next unless TIES.include?(type) && b.is_a?(Array)

    first, second = get(b, "first"), get(b, "second")
    next unless first && second

    { type: type, subject_type: get(b, "subject_type"), first: first, second: second,
      from: date_key(get(b, "start_date") || "1.1.1"), to: get(b, "end_date") ? date_key(get(b, "end_date")) : nil }
  end
end

# --- Technology groups: the level a country starts with, and its unit group ---------------------
tech_groups = (get(parse(read(File.join(GAME, "common/technology.txt"))), "groups") || []).filter_map do |name, b|
  next unless name && b.is_a?(Array)

  [ name, { start_level: get(b, "start_level")&.to_i, unit_type: get(b, "nation_designer_unit_type") || name, name: name_of(name) || name.tr("_", " ").capitalize } ]
end.to_h

# --- A country at a date -------------------------------------------------------------------------
def person(b)
  return nil unless b.is_a?(Array)

  adm, dip, mil = %w[adm dip mil].map { |k| get(b, k)&.to_i }
  { name: get(b, "monarch_name") || get(b, "name"), dynasty: get(b, "dynasty"), born: get(b, "birth_date")&.split(".")&.first&.to_i,
    adm: adm, dip: dip, mil: mil }.compact
end

def country_at(c, date)
  limit = date_key(date)
  scalars = c[:initial].dup
  lists = c[:lists].transform_values(&:dup)
  ruler = heir = nil
  c[:changes].each do |d, sc, ls, people|
    next if (d <=> limit).positive?

    scalars.merge!(sc)
    ls.each { |k, v| lists[k] |= v }
    ruler = person(people[:monarch]) || ruler
    heir = people[:heir] ? person(people[:heir]) : heir
  end
  heir = nil if heir && ruler && heir[:born] && ruler[:born] && heir[:born] <= ruler[:born]
  { scalars: scalars, lists: lists, ruler: ruler, heir: heir }
end

# --- Put it together -----------------------------------------------------------------------------------
result = countries.values.map do |c|
  { tag: c[:tag], name: name_of(c[:tag]) || c[:tag], adjective: name_of("#{c[:tag]}_ADJ"), at: {} }
end.to_h { |c| [ c[:tag], c ] }

BOOKMARKS.each do |date|
  owned = Hash.new { |h, k| h[k] = [] }
  provinces.each do |p|
    s = province_at(p, date)
    owned[s["owner"]] << { id: p[:id], tax: s["base_tax"].to_i, prod: s["base_production"].to_i, man: s["base_manpower"].to_i,
                           goods: s["trade_goods"], religion: s["religion"], culture: s["culture"], city: s["is_city"] == "yes", hre: s["hre"] == "yes" } if s["owner"]
  end
  limit = date_key(date)
  active = ties.select { |t| (t[:from] <=> limit) <= 0 && (t[:to].nil? || (t[:to] <=> limit).positive?) }
  prov_name = ->(id) { name_of("PROV#{id}") || "Province #{id}" }

  owned.each do |tag, provs|
    entry = result[tag] or next
    c = countries[tag]
    state = country_at(c, date)
    sc = state[:scalars]
    goods = provs.group_by { |p| p[:goods] }.transform_values { |v| v.sum { |p| p[:tax] + p[:prod] + p[:man] } }.reject { |g, _| g.nil? }.sort_by { |_, d| -d }.first(5)
    faiths = provs.group_by { |p| p[:religion] }.transform_values { |v| v.sum { |p| p[:tax] + p[:prod] + p[:man] } }.reject { |g, _| g.nil? }.sort_by { |_, d| -d }.first(3)
    cap = sc["capital"]&.to_i
    mine = active.select { |t| t[:first] == tag || t[:second] == tag }
    entry[:at][date] = {
      provinces: provs.size, tax: provs.sum { |p| p[:tax] }, prod: provs.sum { |p| p[:prod] }, man: provs.sum { |p| p[:man] },
      cities: provs.count { |p| p[:city] }, hre: provs.count { |p| p[:hre] },
      goods: goods, religions: faiths,
      government: sc["government"], reforms: state[:lists][:reforms], rank: sc["government_rank"]&.to_i,
      religion: sc["religion"], culture: sc["primary_culture"], accepted: state[:lists][:accepted],
      tech_group: sc["technology_group"], capital: cap && prov_name.call(cap), capital_id: cap,
      ruler: state[:ruler], heir: state[:heir],
      rivals: state[:lists][:rivals], friends: state[:lists][:friends],
      allies: mine.select { |t| t[:type] == "alliance" }.map { |t| t[:first] == tag ? t[:second] : t[:first] }.uniq,
      overlord: mine.select { |t| t[:second] == tag && %w[vassal march union dependency].include?(t[:type]) }.map { |t| { tag: t[:first], type: t[:subject_type] || t[:type] } }.first,
      subjects: mine.select { |t| t[:first] == tag && %w[vassal march union dependency].include?(t[:type]) }.map { |t| { tag: t[:second], type: t[:subject_type] || t[:type] } },
      guarantees: mine.select { |t| t[:type] == "guarantee" && t[:first] == tag }.map { |t| t[:second] },
      marriages: mine.select { |t| t[:type] == "royal_marriage" }.map { |t| t[:first] == tag ? t[:second] : t[:first] }.uniq
    }.compact
  end
end

list = result.values.select { |c| c[:at].any? }.sort_by { |c| [ -(c[:at][BOOKMARKS.first]&.then { |a| a[:tax] + a[:prod] + a[:man] } || 0), c[:name] ] }

# --- Flags (128x128 TGA, kept at 48x48) ---------------------------------------------------------------
made = 0
list.each do |c|
  dest = File.join(FLAGS, "#{c[:tag]}.png")
  src = File.join(GAME, "gfx/flags/#{c[:tag]}.tga")
  # A few of the game's 16-bit flags carry an alpha channel that is 0 everywhere: ignore it.
  opaque = File.exist?(src) && Open3.capture3("magick", src, "-format", "%[fx:maxima.a]", "info:")[0].to_f.zero? ? [ "-alpha", "off" ] : []
  if File.exist?(dest) || (File.exist?(src) && Open3.capture3("magick", src, *opaque, "-resize", "48x48", dest)[2].success?)
    c[:flag] = true
    made += 1
  end
end

# Names for everything the page shows by key.
keys = list.flat_map { |c| c[:at].values.flat_map { |a| [ a[:government], *a[:reforms], a[:religion], a[:culture], *a[:accepted], a[:tech_group], *a[:goods].map(&:first), *a[:religions].map(&:first), a[:overlord]&.dig(:type), *a[:subjects].map { |s| s[:type] } ] } }.compact.uniq
names = keys.to_h { |k| [ k, name_of(k) ] }.reject { |_, v| v.nil? || v.empty? }

# --- Missions: the mission trees of each country ------------------------------------------------------
# A series is `potential`-gated; the ones that name a tag belong to that country. The game's DLC
# conditions are evaluated as a player who owns everything (the newest version of a tree wins).
# Three-valued: true, false, or nil when the condition is something we can't evaluate (a map
# setting, a flag...), which neither makes a series apply nor rules it out.
def holds?(block, tag) = (block || []).none? { |k, v| holds_one?(k, v, tag) == false }

def holds_one?(key, value, tag)
  inner = -> { value.is_a?(Array) ? value.map { |k, v| holds_one?(k, v, tag) } : [] }
  case key
  when "tag" then value == tag
  when "has_dlc" then true
  when "AND" then (r = inner.call).include?(false) ? false : (r.include?(nil) ? nil : true)
  when "OR" then (r = inner.call).include?(true) ? true : (r.include?(nil) ? nil : false)
  when "NOT", "NOR" then (r = inner.call).include?(true) ? false : (r.include?(nil) ? nil : true)
  end
end

def positive_tags(block, negated = false)
  (block || []).flat_map do |k, v|
    if k == "tag" && v.is_a?(String) then negated ? [] : [ v ]
    elsif %w[NOT NOR].include?(k) && v.is_a?(Array) then positive_tags(v, !negated)
    elsif v.is_a?(Array) then positive_tags(v, negated)
    else []
    end
  end
end

series_list = Dir[File.join(GAME, "missions/*.txt")].sort.flat_map do |f|
  parse(read(f)).filter_map do |key, body|
    next unless key && body.is_a?(Array) && get(body, "slot") && get(body, "generic") != "yes"

    nodes = body.select { |k, v| k && v.is_a?(Array) && get(v, "icon") }
    next if nodes.empty?

    { key: key, slot: get(body, "slot").to_i, potential: get(body, "potential") || [], nodes: nodes }
  end
end

def layout(nodes)
  nodes = nodes.to_h
  req = nodes.to_h { |k, v| [ k, all(get(v, "required_missions") || [], nil).grep(String) ] }
  positions = nodes.to_h { |k, v| [ k, get(v, "position")&.to_i ] }
  depth = {}
  depth_of = lambda do |k, seen = []|
    return depth[k] if depth[k]
    return 0 if seen.include?(k)

    depth[k] = (req[k].select { |r| req.key?(r) }.map { |r| depth_of.call(r, seen + [ k ]) + 1 }.max || 0)
  end
  nodes.each_key { |k| depth_of.call(k) }
  rows = depth
  cols = {}
  rows.group_by { |_, r| r }.each do |_, group|
    keys = group.map(&:first)
    keys = keys.sort_by { |k| req[k].filter_map { |r| cols[r] }.then { |c| c.empty? ? 0 : c.sum.to_f / c.size } } if keys.size > 1
    keys.each_with_index { |k, i| cols[k] = i }
  end
  nodes.keys.to_h { |k| [ k, { x: cols[k] || 0, y: rows[k] || 0, req: req[k] } ] }
end

tags_present = list.map { |c| c[:tag] }.to_set
# The game stacks a country's series into one tree per slot (a continuation requires missions of
# the series before it), so series are merged by slot and laid out together.
by_tag_series = Hash.new { |h, k| h[k] = [] }
series_list.each do |s|
  positive_tags(s[:potential]).uniq.select { |t| tags_present.include?(t) && holds?(s[:potential], t) }.each { |t| by_tag_series[t] << s }
end

trees = {}
by_tag = {}
by_tag_series.each do |tag, owned|
  by_tag[tag] = owned.group_by { |s| s[:slot] }.sort.map do |slot, group|
    id = "#{slot}:#{group.map { |s| s[:key] }.join('+')}"
    trees[id] ||= begin
      nodes = group.flat_map { |s| s[:nodes] }.uniq { |k, _| k }
      place = layout(nodes)
      { slot: slot, missions: nodes.map { |k, v| { key: k, title: name_of("#{k}_title") || k.tr("_", " ").capitalize, desc: name_of("#{k}_desc"), **place[k] } } }
    end
    id
  end
end
File.write(File.join(__dir__, "missions.json"), JSON.generate(trees: trees, by_tag: by_tag))
mission_series = trees
by_tag_count = by_tag.size
puts "Wrote eu4tech/missions.json: #{trees.size} mission trees for #{by_tag.size} countries, #{trees.values.sum { |t| t[:missions].size }} missions (#{File.size(File.join(__dir__, 'missions.json')) / 1024} KB)"

# --- National ideas: <TAG>_ideas with traditions (start), ambition (bonus) and seven ideas -------------------
# EU4 has no table saying how a modifier's number is shown, so which are percentages is a
# best guess: the names the game uses for flat amounts are listed, and fractions are percentages.
FLAT_MODIFIER = /\A(yearly_|monthly_)|diplomats|merchants|colonists|missionaries|diplomatic_reputation|tolerance|unrest|_tradition\z|\Alegitimacy|devotion|horde_unity|free_leader_pool|\Aleader_|prestige\z|absolutism|governing_capacity|forcelimit\z|war_exhaustion|\Adiplomatic_upkeep|\Aambition|\Aprovince_warscore_cost|\Aembargo|\Aspy_offence|\Afabricate|\Aallowed_|\Aprofessionalism|\Acan_|\Amay_|\Anum_|\Aimproved|\Aunjustified_demands|\Aaccept_vassalization|\Aglobal_ship_recruit|\Aadministrative_efficiency\z|\Aland_attrition|\Anaval_attrition|\Amax_|\A.*_slots?\z/

def idea_modifiers(block)
  block.filter_map do |k, v|
    next if k.nil? || %w[effect trigger ai_will_do].include?(k)

    label = name_of(k) || name_of("modifier_#{k}") || k.tr("_", " ").capitalize
    if v.to_s.match?(/\A-?[\d.]+\z/)
      value = v.to_f
      { key: k, label: label, value: value, kind: !k.match?(FLAT_MODIFIER) && value.abs < 1 ? "percent" : "number" }
    elsif v == "yes"
      { key: k, label: label, flag: true }
    end
  end
end

ideas = {}
Dir[File.join(GAME, "common/ideas/*.txt")].sort.each do |f|
  parse(read(f)).each do |group, body|
    next unless group&.end_with?("_ideas") && body.is_a?(Array) && get(body, "trigger").is_a?(Array)

    owners = positive_tags(get(body, "trigger")).uniq.select { |t| tags_present.include?(t) }
    next if owners.empty?

    entry = {
      name: name_of(group) || group.tr("_", " ").capitalize,
      start: idea_modifiers(get(body, "start") || []), bonus: idea_modifiers(get(body, "bonus") || []),
      ideas: body.select { |k, v| k && v.is_a?(Array) && !%w[start bonus trigger ai_will_do].include?(k) }.map do |k, v|
        { key: k, name: name_of(k) || k.tr("_", " ").capitalize, desc: name_of("#{k}_desc"), mods: idea_modifiers(v) }
      end
    }
    owners.each { |t| ideas[t] = entry }
  end
end
File.write(File.join(__dir__, "ideas.json"), JSON.generate(by_tag: ideas))
puts "Wrote eu4tech/ideas.json: national ideas for #{ideas.size} countries (#{File.size(File.join(__dir__, 'ideas.json')) / 1024} KB)"

version = read(File.join(GAME, "launcher-settings.json"))[/"rawVersion":\s*"v?([^"]+)"/, 1] rescue nil
File.write(OUT, JSON.generate(game_version: version, generated_at: Time.now.utc.iso8601, dates: BOOKMARKS, tech_groups: tech_groups, names: names, countries: list))
puts "Wrote #{list.size} countries across #{BOOKMARKS.size} dates (#{BOOKMARKS.join(', ')}); flags: #{made}"
puts "At #{BOOKMARKS.first}: #{list.count { |c| c[:at][BOOKMARKS.first] }} countries; first few: #{list.first(5).map { |c| "#{c[:name]} #{c[:at][BOOKMARKS.first].values_at(:tax, :prod, :man).sum}" }.join(', ')}"
puts "File size: #{File.size(OUT) / 1024} KB"
