# Reads a local Europa Universalis IV install and writes eu4/data.json: every
# land unit with its pips, and what each military tech level adds and
# unlocks. Self-contained -- shares nothing with the Vic3 page, so this
# folder can move to another app as is.
#
#   ruby eu4/extract.rb                      # default Steam install on macOS
#   ruby eu4/extract.rb "/path/to/Europa Universalis IV"
#
# The output is Paradox's game data, so it's gitignored, never committed.
require "json"

GAME = ARGV[0] || ENV.fetch("EU4_GAME_DIR",
  File.expand_path("~/Library/Application Support/Steam/steamapps/common/Europa Universalis IV"))
OUT = File.join(__dir__, "data.json")
abort "No EU4 install at #{GAME} -- pass its path as the first argument." unless Dir.exist?(File.join(GAME, "common"))

# --- Paradox script ------------------------------------------------------------
# key = value / key = { ... } / bare values in lists. Returns an array of
# [key, value] pairs (keys repeat: a tech has many "enable" lines); a list
# like { a b c } becomes [[nil, "a"], [nil, "b"], [nil, "c"]].
def parse(text)
  tokens = text.gsub(/#[^\n]*/, "").scan(/"[^"]*"|[{}=]|[^\s{}=]+/)
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

# Script files are Windows-1252; localisation is UTF-8 with a BOM.
def read(path) = File.read(path, encoding: "windows-1252:utf-8")
def read_utf8(path) = File.read(path, encoding: "bom|utf-8")

# --- English names -------------------------------------------------------------
NAMES = {}
Dir[File.join(GAME, "localisation", "*_l_english.yml")].each do |f|
  read_utf8(f).scan(/^\s*([\w.]+):\d*\s+"(.*)"\s*$/) { |k, v| NAMES[k] ||= v }
end

# --- Units ---------------------------------------------------------------------
PIPS = %w[offensive_fire defensive_fire offensive_shock defensive_shock offensive_morale defensive_morale].freeze
LAND = %w[infantry cavalry artillery].freeze

units = Dir[File.join(GAME, "common", "units", "*.txt")].sort.filter_map do |f|
  u = parse(read(f)).to_h { |k, v| [k, v.is_a?(String) ? v.strip : v] }
  next unless LAND.include?(u["type"])

  id = File.basename(f, ".txt")
  {
    id: id, name: NAMES[id] || id, type: u["type"],
    # Artillery has no unit_type: every group shares the same artillery line.
    group: u["unit_type"], maneuver: u["maneuver"].to_i,
    pips: PIPS.to_h { |p| [p, u[p].to_i] },
  }
end

# --- Technology ------------------------------------------------------------------
# adm.txt, dip.txt and mil.txt: one technology = { ... } per level. Effects
# are additive -- a level's value is the sum of it and every level before
# (tech 0 holds the base values) -- so every numeric key except the year is
# kept. "enable = <id>" unlocks units (mil) or buildings (adm/dip); flags like
# may_drill = yes are kept as unlocks too.
def techs_for(category)
  parse(read(File.join(GAME, "common", "technologies", "#{category}.txt")))
    .select { |k, _| k == "technology" }
    .each_with_index.map do |(_, t), level|
      {
        level: level,
        year: t.find { |k, _| k == "year" }&.last.to_i,
        effects: t.select { |k, v| k != "year" && v.is_a?(String) && v.match?(/\A-?[\d.]+\z/) }.to_h { |k, v| [k, v.to_f] },
        enables: t.select { |k, _| k == "enable" }.map(&:last),
        flags: t.select { |k, v| v == "yes" }.map(&:first),
      }
    end
end
TECHS = %w[adm dip mil].to_h { [_1, techs_for(_1)] }

# Values a country has before any tech, which the tech files build on:
# combat width from defines.lua, the rest from static_modifiers' base_values.
bases = {}
bases["combat_width"] = read(File.join(GAME, "common", "defines.lua"))[/BASE_COMBAT_WIDTH\s*=\s*([\d.]+)/, 1].to_f
Dir[File.join(GAME, "common", "static_modifiers", "*.txt")].each do |f|
  base_values = parse(read(f)).find { |k, _| k == "base_values" }&.last || []
  base_values.each { |k, v| bases[k] = v.to_f if TECHS.values.flatten.any? { _1[:effects].key?(k) } && v.is_a?(String) }
end
# Keys a tech level sets outright instead of adding to (1, 2 ... 8 idea groups).
ABSOLUTE = %w[allowed_idea_groups].freeze
techs = TECHS["mil"]

unlocked_at = techs.flat_map { |t| t[:enables].map { |id| [id, t[:level]] } }.to_h
units.each { |u| u[:tech] = unlocked_at[u[:id]] }
missing = units.reject { _1[:tech] }.map { _1[:id] }
warn "Units no mil tech unlocks (left out): #{missing.join(', ')}" if missing.any?
units.select! { _1[:tech] }

version = read(File.join(GAME, "launcher-settings.json"))[/"rawVersion":\s*"v?([^"]+)"/, 1] rescue nil
File.write(OUT, JSON.generate(
  game_version: version, generated_at: Time.now.utc.iso8601,
  bases: bases, absolute: ABSOLUTE,
  groups: units.filter_map { _1[:group] }.uniq.sort, techs: TECHS,
  # English names for effects and unlocked buildings, where the game has them.
  names: (TECHS.values.flatten.flat_map { _1[:effects].keys + _1[:enables] + _1[:flags] }.uniq)
    .to_h { [_1, NAMES[_1] || NAMES["modifier_#{_1}"] || NAMES["building_#{_1}"]] }.compact, units: units.sort_by { [_1[:tech], _1[:type], _1[:id]] },
))
puts "Wrote #{units.size} land units in #{units.filter_map { _1[:group] }.uniq.size} groups and #{TECHS.map { "#{_2.size} #{_1}" }.join(' / ')} techs (EU4 #{version}) to #{OUT}"
