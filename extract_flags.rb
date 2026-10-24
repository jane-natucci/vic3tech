# Draws Victoria 3's flags from the game's own coat-of-arms recipes (the game has no flag images:
# it paints each flag from a background pattern, colour-mask emblems and full-colour emblems).
# Writes vic3/flags/<TAG>.png (288x192) and vic3/flags/s/<TAG>.png (72x48, for lists) for every country in vic3/data.json
# (run extract.rb first). Each country gets the flag it has at the 1836 start: the game chooses by government,
# culture and so on (common/flag_definitions), which coa_rules.rb works out.
#
#   ruby extract_flags.rb                  # every country
#   ruby extract_flags.rb FRA PRU GBR      # just these tags (to look at them)
#   FLAG_OUT=/some/dir ruby extract_flags.rb FRA   # somewhere else
#
# How the art works, found by sampling the textures: in a pattern, red is the first colour, yellow
# the second and white the third; in a coloured emblem the green channel is the second colour, the
# red channel the third and everything else with alpha the first. Colours are named ("blue") in
# common/named_colors or given as rgb { } / hsv360 { }. An emblem's `instance` says where its
# centre is (0..1 across the flag), how big it is (a share of the flag) and its rotation.
# The output is Paradox's art, so it is gitignored, never committed. Needs ImageMagick (`magick`).
require "json"
require "fileutils"
require "open3"
require "pathname"
require "tmpdir"

Encoding.default_external = Encoding::UTF_8

GAME = Pathname(ENV.fetch("VIC3_GAME_DIR", File.expand_path("~/Library/Application Support/Steam/steamapps/common/Victoria 3/game")))
OUT = Pathname(ENV.fetch("FLAG_OUT", File.join(__dir__, "vic3/flags")))
W = 288
H = 192
abort "No Victoria 3 install at #{GAME}" unless GAME.join("common/coat_of_arms").directory?

# --- Paradox script, with typed values (hsv360 { ... }) --------------------------------------------
module Script
  TOKEN = /"(?:[^"\\]|\\.)*"|#[^\n]*|[{}=]|[^\s{}="#]+/

  def self.parse(text)
    tokens = text.delete_prefix("﻿").scan(TOKEN).reject { |t| t.start_with?("#") }
    pos = 0
    value = nil
    block = lambda do
      pairs = []
      while pos < tokens.size
        tok = tokens[pos]
        pos += 1
        return pairs if tok == "}"

        if tokens[pos] == "="
          pos += 1
          pairs << [tok.delete('"'), value.call]
        else
          pairs << [nil, tok.start_with?("{") ? [] : tok.delete('"')]
        end
      end
      pairs
    end
    value = lambda do
      tok = tokens[pos]
      pos += 1
      if tok == "{"
        block.call
      elsif tokens[pos] == "{" && tok.match?(/\A[a-z0-9_]+\z/) # hsv360 { 1 2 3 }
        pos += 1
        { type: tok, list: block.call.map(&:last) }
      else
        tok.delete('"')
      end
    end
    block.call
  end

  def self.get(block, key) = block.is_a?(Array) ? block.find { |k, _| k == key }&.last : nil
  def self.all(block, key) = block.is_a?(Array) ? block.select { |k, _| k == key }.map(&:last) : []
end

# --- Colours ------------------------------------------------------------------------------------------------
def hsv_to_rgb(h, s, v)
  s = s.clamp(0.0, 1.0)
  v = v.clamp(0.0, 1.0)
  c = v * s
  x = c * (1 - (((h / 60.0) % 2) - 1).abs)
  m = v - c
  r, g, b = case (h % 360) / 60
            when 0...1 then [ c, x, 0 ]
            when 1...2 then [ x, c, 0 ]
            when 2...3 then [ 0, c, x ]
            when 3...4 then [ 0, x, c ]
            when 4...5 then [ x, 0, c ]
            else [ c, 0, x ]
            end
  [ r + m, g + m, b + m ]
end

def to_hex(rgb) = "#" + rgb.map { |c| (c.clamp(0.0, 1.0) * 255).round.to_s(16).rjust(2, "0") }.join

def parse_color(v)
  return nil unless v.is_a?(Hash)

  nums = v[:list].map(&:to_f)
  case v[:type]
  when "hsv360" then to_hex(hsv_to_rgb(nums[0], nums[1] / 100.0, nums[2] / 100.0))
  when "hsv" then to_hex(hsv_to_rgb(nums[0] * 360, nums[1], nums[2]))
  when "rgb" then to_hex(nums.max > 1 ? nums.map { |n| n / 255.0 } : nums)
  end
end

NAMED = {}
Dir[GAME.join("common/named_colors/*.txt").to_s].sort.each do |f|
  Script.get(Script.parse(File.read(f)), "colors")&.each { |k, v| (c = parse_color(v)) && NAMED[k] = c }
end

# --- Recipes -------------------------------------------------------------------------------------------------------
# Recipes use named numbers (`@usa_star_scale_24 = 0.2`) and small sums (`@[ 1 / 7 * 2 ]`): settle both before parsing.
VARS = {}

def settle_numbers(text)
  out = text.lines.map do |line|
    line = line.sub(/#.*\z/, "") unless line.include?("\"") # a comment, unless the line quotes something
    line = line.gsub(/@([A-Za-z_][A-Za-z0-9_]*)/) { VARS.key?($1) && !line.match?(/\A\s*@#{Regexp.escape($1)}\s*=/) ? VARS[$1] : $& }
    line = line.gsub(/@\[([^\]]*)\]/) { sum($1) }
    if (m = line.match(/\A\s*@([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\S+)/))
      VARS[m[1]] = m[2]
      next ""
    end
    line
  end
  out.join
end

# Plain arithmetic only: digits, + - * / and brackets.
def sum(expr)
  expr = expr.gsub(/[A-Za-z_][A-Za-z0-9_]*/) { VARS[$&] || $& } # `@[third*2]`: names inside the brackets are numbers too
  return "0" unless expr.match?(/\A[\d\s.+\-*\/()]+\z/)

  (eval(expr.gsub(/(?<![\d.])(\d+)(?![\d.])/, '\1.0')) || 0).round(6).to_s # rubocop:disable Security/Eval
end

COA = {}
Dir[GAME.join("common/coat_of_arms/coat_of_arms/*.txt").to_s].sort.each do |f|
  Script.parse(settle_numbers(File.read(f))).each { |k, v| COA[k] = v if k && v.is_a?(Array) }
end

TEXTURES = { "pattern" => "patterns", "colored" => "colored_emblems", "textured" => "textured_emblems" }.freeze

# Every image we write is a full colour PNG: ImageMagick would otherwise save a white or black layer as grey,
# and the next composite then flattens the colours of everything it meets to grey.
def png(path) = "PNG32:#{path}"

def texture(kind, name) = GAME.join("gfx/coat_of_arms", TEXTURES.fetch(kind), name)

def run(*cmd)
  _out, err, status = Open3.capture3(*cmd)
  raise "#{cmd.first(4).join(' ')}: #{err.strip[0, 200]}" unless status.success?
end

# Colours a recipe names that the game never defines (they would draw nothing): Grão-Pará's star asks for
# `light_blue`, which no file defines, so it gets silver.
COLOUR_FIXES = { "PRA" => { "light_blue" => "silver" } }.freeze
NAMED["silver"] ||= "#c0c0c0"

# A colour value inside a recipe: a name, an inline colour, or another colour of the same recipe (color1 = color2).
def resolve(value, palette)
  return parse_color(value) if value.is_a?(Hash)
  return palette[value] if value.is_a?(String) && palette.key?(value)

  NAMED[COLOUR_FIXES.dig($current_recipe, value) || value]
end

# The pattern with its three masks filled with the recipe's colours.
def paint_pattern(file, colors, dest)
  c1, c2, c3 = colors
  Dir.mktmpdir do |dir|
    base = File.join(dir, "base.png")
    run("magick", file.to_s, "-resize", "#{W}x#{H}!", "-alpha", "off", png(base))
    run("magick", "-size", "#{W}x#{H}", "xc:#{c1}", png(File.join(dir, "l1.png")))
    { "G" => [ c2, "l2.png" ], "B" => [ c3, "l3.png" ] }.each do |channel, (color, name)|
      mask = File.join(dir, "m#{channel}.png")
      run("magick", base, "-channel", channel, "-separate", "+channel", png(mask))
      run("magick", "(", "-size", "#{W}x#{H}", "xc:#{color}", ")", mask, "-alpha", "off", "-compose", "CopyOpacity", "-composite", png(File.join(dir, name)))
    end
    run("magick", File.join(dir, "l1.png"), File.join(dir, "l2.png"), "-compose", "over", "-composite", File.join(dir, "l3.png"), "-compose", "over", "-composite", png(dest))
  end
end

# A colour-mask emblem as a flat RGBA layer: colour 1 under, colour 2 where green, colour 3 where red.
def paint_colored_emblem(file, colors, dest)
  c1, c2, c3 = colors
  Dir.mktmpdir do |dir|
    src = File.join(dir, "src.png")
    run("magick", file.to_s, src)
    a = File.join(dir, "a.png")
    g = File.join(dir, "g.png")
    r = File.join(dir, "r.png")
    run("magick", src, "-alpha", "extract", a)
    run("magick", src, "-alpha", "off", "-channel", "G", "-separate", "+channel", g)
    run("magick", src, "-alpha", "off", "-channel", "R", "-separate", "+channel", r)
    w2 = File.join(dir, "w2.png")
    w3 = File.join(dir, "w3.png")
    run("magick", g, a, "-compose", "Multiply", "-composite", w2)
    run("magick", r, a, "-compose", "Multiply", "-composite", w3)
    layers = lambda do |color, mask, out|
      run("magick", "(", src, "-alpha", "off", "-fill", color, "-colorize", "100", ")", mask, "-alpha", "off", "-compose", "CopyOpacity", "-composite", png(out))
    end
    l1 = File.join(dir, "l1.png")
    l2 = File.join(dir, "l2.png")
    l3 = File.join(dir, "l3.png")
    layers.call(c1, a, l1)
    layers.call(c2, w2, l2)
    layers.call(c3, w3, l3)
    run("magick", l1, l2, "-compose", "over", "-composite", l3, "-compose", "over", "-composite", png(dest))
  end
end

# Every `instance` of an emblem or sub-flag; one default instance (centred, full size) if it names none.
def instances(block)
  list = Script.all(block, "instance")
  list.empty? ? [ [] ] : list
end

def place(canvas, layer_file, instance)
  pos = Script.get(instance, "position") || [ [ nil, "0.5" ], [ nil, "0.5" ] ]
  scale = Script.get(instance, "scale") || [ [ nil, "1" ], [ nil, "1" ] ]
  px, py = pos.map { |_, v| v.to_f }
  sx, sy = scale.map { |_, v| v.to_f }
  sy ||= sx # one number scales both ways
  rotation = Script.get(instance, "rotation").to_f
  WARNINGS[$current_recipe] << "emblem scaled to nothing" if sx.abs < 0.005 || sy.abs < 0.005
  w = [ (sx.abs * W).round, 1 ].max
  h = [ (sy.abs * H).round, 1 ].max
  flip = []
  flip << "-flop" if sx.negative?
  flip << "-flip" if sy.negative?
  dx = ((px - 0.5) * W).round
  dy = ((py - 0.5) * H).round
  run("magick", canvas.to_s, "(", layer_file.to_s, "-resize", "#{w}x#{h}!", *flip, "-background", "none", "-rotate", rotation.to_s, ")",
      "-gravity", "center", "-geometry", format("%+d%+d", dx, dy), "-compose", "over", "-composite", png(canvas))
end

# Draws a recipe onto a W x H file and returns it.
WARNINGS = Hash.new { |h, k| h[k] = [] }
KNOWN = %w[pattern color1 color2 color3 color4 color5 colored_emblem textured_emblem sub].freeze
ORDER = { "colored_emblem" => 0, "textured_emblem" => 1, "sub" => 2 }.freeze

def render(name, dir, depth = 0)
  $current_recipe = name
  recipe = COA[name] or raise "no coat of arms #{name}"
  raise "recipe loop at #{name}" if depth > 6

  palette = {}
  %w[color1 color2 color3 color4 color5].each { |k| (c = resolve(Script.get(recipe, k), palette)) && palette[k] = c }
  canvas = File.join(dir, "#{name}-#{depth}-#{rand(1_000_000)}.png")
  pattern = Script.get(recipe, "pattern")
  if pattern && texture("pattern", pattern).exist?
    paint_pattern(texture("pattern", pattern), [ palette["color1"] || "#000000", palette["color2"] || palette["color1"] || "#000000", palette["color3"] || palette["color1"] || "#000000" ], canvas)
  else
    run("magick", "-size", "#{W}x#{H}", "xc:none", png(canvas)) # no pattern: a see-through layer (the arms inside a flag)
  end

  # The game draws every coloured emblem, then every textured emblem, then the sub-flags -- whatever order the
  # file lists them in (Hungary's arms come first in its file and would otherwise sit under the tricolour).
  recipe.each { |k, _| WARNINGS[name] << "unused key #{k}" if k && !KNOWN.include?(k) }
  listed = recipe.select { |k, _| ORDER.key?(k) }
  WARNINGS[name] << "layers listed out of draw order" if listed.map { |k, _| ORDER[k] } != listed.map { |k, _| ORDER[k] }.sort
  layers = listed.sort_by.with_index { |(k, _), i| [ ORDER[k], i ] }

  layers.each do |k, v|
    case k
    when "colored_emblem"
      file = texture("colored", Script.get(v, "texture").to_s)
      (WARNINGS[name] << "missing texture #{Script.get(v, 'texture')}") && next unless file.exist?

      local = palette.dup
      %w[color1 color2 color3].each do |c|
        raw = Script.get(v, c)
        col = resolve(raw, palette)
        raw && !col && WARNINGS[name] << "unknown colour #{raw}"
        col && local[c] = col
      end
      layer = File.join(dir, "ce-#{rand(1_000_000)}.png")
      paint_colored_emblem(file, [ local["color1"] || "#000000", local["color2"] || local["color1"] || "#000000", local["color3"] || local["color1"] || "#000000" ], layer)
      instances(v).each { |inst| place(canvas, layer, inst) }
    when "textured_emblem"
      file = texture("textured", Script.get(v, "texture").to_s)
      (WARNINGS[name] << "missing texture #{Script.get(v, 'texture')}") && next unless file.exist?

      layer = File.join(dir, "te-#{rand(1_000_000)}.png")
      run("magick", file.to_s, png(layer))
      instances(v).each { |inst| place(canvas, layer, inst) }
    when "sub"
      parent = Script.get(v, "parent")
      (WARNINGS[name] << "missing sub-flag #{parent}") && next unless parent && COA[parent]

      sub_file = render(parent, dir, depth + 1)
      instances(v).each do |inst|
        off = Script.get(inst, "offset") || [ [ nil, "0" ], [ nil, "0" ] ]
        scale = Script.get(inst, "scale") || [ [ nil, "1" ], [ nil, "1" ] ]
        ox, oy = off.map { |_, x| x.to_f }
        sx, sy = scale.map { |_, x| x.to_f }
        sy ||= sx
        w = [ (sx * W).round, 1 ].max
        h = [ (sy * H).round, 1 ].max
        run("magick", canvas, "(", sub_file, "-resize", "#{w}x#{h}!", ")", "-gravity", "NorthWest", "-geometry", format("%+d%+d", (ox * W).round, (oy * H).round),
            "-compose", "over", "-composite", png(canvas))
      end
    end
  end
  canvas
end

# --- Which recipe each country flies at the start (flag_definitions: by government, culture ...) ---------------------
require_relative "vic3_script"
require_relative "coa_rules"
require "set"

DATA = JSON.parse(File.read(File.join(__dir__, "vic3/data.json")))
COUNTRIES = DATA["countries"].to_h { |c| [ c["tag"], c ] }
DEFINITIONS = Dir[GAME.join("common/country_definitions/*.txt").to_s].sort.flat_map { |f| Vic3Script.parse(File.read(f)) }
                    .select { |k, _, v| k && v.is_a?(Array) }.to_h { |k, _, v| [ k, v ] }
RULES = CoaRules.new(GAME, COUNTRIES.keys.to_set)

def recipe_for(tag)
  c = COUNTRIES[tag] or return tag
  cultures = Vic3Script.list(Vic3Script.value(DEFINITIONS[tag] || [], "cultures"))
  RULES.flag_coa(CoaRules::Facts.new(tag: tag, laws: c["laws"].to_set, cultures: cultures.to_set), COA.keys.to_set)
end

SMALL = "72x48" # the list on the left of a page: about 36 px wide, drawn at twice that for sharp screens

# Countries with no recipe (the many small ones the game gives a *random* flag, made on the spot and different
# every campaign) get a plain tile in the colour they have on the game's map: honest, and it can't be wrong.
def map_colour_tile(tag, dir)
  nums = Vic3Script.list(Vic3Script.value(DEFINITIONS[tag] || [], "color")).map(&:to_f)
  nums = nums.map { |n| nums.max > 1 ? n / 255.0 : n } if nums.size == 3
  rgb = nums.size == 3 ? to_hex(nums) : "#555555"
  file = File.join(dir, "tile.png")
  run("magick", "-size", "#{W}x#{H}", "xc:#{rgb}", png(file))
  file
end

# --- Go ------------------------------------------------------------------------------------------------------------------------
tags = ARGV.empty? ? JSON.parse(File.read(File.join(__dir__, "vic3/data.json")))["countries"].map { |c| c["tag"] } : ARGV
FileUtils.mkdir_p(OUT.join("s"))
ok = []
failed = {}
tags.each do |tag|
  Dir.mktmpdir("flag") do |dir|
    recipe = recipe_for(tag)
    final = COA.key?(recipe) ? render(recipe, dir) : map_colour_tile(tag, dir)
    run("magick", final, "-resize", "#{W}x#{H}", "-strip", png(OUT.join("#{tag}.png")))
    run("magick", final, "-filter", "Lanczos", "-resize", SMALL, "-strip", png(OUT.join("s", "#{tag}.png")))
    ok << tag
  rescue StandardError => e
    failed[tag] = e.message[0, 120]
  end
end
puts "Flags: #{ok.size} drawn into #{OUT}, #{failed.size} failed"
shown = WARNINGS.select { |recipe, w| ok.any? { |t| recipe_for(t) == recipe } || true }
puts "Recipes with something we skipped or may have got wrong (#{shown.size}):"
shown.sort.each { |recipe, w| puts "  #{recipe}: #{w.uniq.join('; ')}" }
failed.first(10).each { |t, m| puts "  #{t}: #{m}" }
