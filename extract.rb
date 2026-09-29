#!/usr/bin/env ruby
# Extracts the Victoria 3 tech tree, every country's 1836 starting techs,
# armies, units, buildings and resources straight out of a local game
# install, into vic3/ (data.json, economy.json and PNG images) for
# index.html. Re-run after a game patch, then ./deploy.sh.
#
#   ruby extract.rb                      # default Steam install on macOS
#   ruby extract.rb "/path/to/Victoria 3/game"
#
# Needs ImageMagick (`magick`) for the images. The output is generated from
# Paradox's game files, so it's git-ignored and never committed.
require "json"
require "pathname"
require "set"
require "time"

# Game files are UTF-8 (names like "Württemberg"); don't depend on the shell's locale.
Encoding.default_external = Encoding::UTF_8

# Just enough of a parser for Paradox's Jomini script format: `key = value`,
# `key ?= { ... }`, comparisons, bare list items and # comments. A block is
# an array of [key, op, value] entries; bare list items have a nil key.
module Vic3Script
  TOKEN = /\s+|#[^\n]*|"(?:[^"\\]|\\.)*"|[?!<>=]=|[={}<>]|[^\s={}<>#"]+/

  def self.parse(text)
    tokens = text.delete_prefix("﻿").scan(TOKEN).reject { |t| t.match?(/\A\s/) || t.start_with?("#") }
    block, = parse_block(tokens, 0)
    block
  end

  def self.parse_block(tokens, i)
    entries = []
    while i < tokens.size && tokens[i] != "}"
      first = tokens[i]
      if tokens[i + 1]&.match?(/\A(?:[?!<>=]=|[=<>])\z/)
        op = tokens[i + 1]
        value, i = parse_value(tokens, i + 2)
        entries << [unquote(first), op, value]
      else
        value, i = parse_value(tokens, i)
        entries << [nil, nil, value]
      end
    end
    [entries, i + 1]
  end

  def self.parse_value(tokens, i)
    return parse_block(tokens, i + 1) if tokens[i] == "{"
    [unquote(tokens[i]), i + 1]
  end

  def self.unquote(token) = token.delete_prefix('"').delete_suffix('"')

  def self.values(block, key) = block.select { |k, _, _| k == key }.map(&:last)
  def self.value(block, key) = values(block, key).first
  def self.list(block) = block.is_a?(Array) ? block.map(&:last).select { |v| v.is_a?(String) } : []

  # Every [key, value] at any depth -- starting techs sometimes sit inside
  # `if = { limit = { has_dlc_feature = ... } }` blocks.
  def self.walk(block, &visit)
    block.each do |k, _, v|
      visit.call(k, v)
      walk(v, &visit) if v.is_a?(Array)
    end
  end
end

class Vic3Extractor
  CATEGORIES = %w[production military society].freeze
  UNLOCK_DIRS = {
    "buildings" => "Building", "production_methods" => "Production method",
    "laws" => "Law", "combat_unit_types" => "Unit", "ship_types" => "Ship",
    "ship_modifications" => "Ship modification", "mobilization_options" => "Mobilization option",
    "decrees" => "Decree", "diplomatic_actions" => "Diplomatic action", "parties" => "Party"
  }.freeze

  def initialize(game_dir, out_dir)
    @game = Pathname(game_dir)
    @out = Pathname(out_dir)
    raise "No Victoria 3 game dir at #{@game}" unless @game.join("common/technology").directory?
  end

  def call
    techs = extract_techs
    add_unlocks(techs)
    techs.each_value { |t| t[:unlocks].uniq! }
    countries = extract_countries(techs)
    add_armies(countries)
    icons = write_icons(techs)
    units, ships, mobilization = extract_units, extract_ships, extract_mobilization

    data = {
      generated_at: Time.now.utc.iso8601,
      game_version: game_version,
      eras: techs.values.map { |t| t[:era] }.uniq.sort,
      categories: CATEGORIES,
      research: research_rules,
      # For loaded saves: every tag's name (Germany, formed later, isn't one
      # of the 1836 countries) and every state's region.
      # Placeholder tags for countries created in play (D01, D09, ...) have no
      # name; the page names those after their capital instead.
      country_names: country_definitions.keys.filter_map { |tag| (name = text(tag)) && [tag, name] }.to_h,
      state_regions: state_region,
      goods: extract_goods,
      treaty_articles: files("treaty_articles").flat_map { |f| read(f) }.select { |_, _, b| b.is_a?(Array) }.to_h { |id, _, _| [id, text(id) || humanize(id)] },
      treaties: extract_treaties,
      techs: techs.values.map { |t| t.except(:texture).merge(icon: icons[t[:id]]) },
      units: units,
      ships: ships,
      mobilization: mobilization,
      countries: countries.values.select { |c| c[:exists] }.map { |c| c.except(:exists) }
    }
    @out.mkpath
    @out.join("data.json").write(JSON.generate(data))
    economy = extract_economy(data[:countries].map { |c| c[:tag] }.to_set)
    @out.join("economy.json").write(JSON.generate(economy))
    puts "Wrote #{data[:techs].size} techs, #{units.size} units, #{ships.size} ships, #{mobilization.size} mobilization options, " \
         "#{data[:countries].size} countries, #{economy[:buildings].size} building types to #{@out}"
  end

  private

  # e.g. "1.13.11", from the launcher's settings next to the game dir.
  def game_version
    JSON.parse(File.read(@game.parent.join("launcher/launcher-settings.json")))["rawVersion"]
  rescue Errno::ENOENT, JSON::ParserError
    nil
  end

  def read(path) = Vic3Script.parse(File.read(path, encoding: "UTF-8"))
  def files(dir) = Dir[@game.join("common", dir, "*.txt")].sort

  def loc
    @loc ||= Dir[@game.join("localization/english/**/*_l_english.yml")].each_with_object({}) do |path, h|
      File.foreach(path, encoding: "UTF-8") do |line|
        # Most files indent entries by a space, a few don't -- accept both.
        h[$1] ||= $2 if line =~ /\A\s*([\w.\-]+):\d*\s+"(.*)"\s*(?:#.*)?\z/
      end
    end
  end

  # Resolves $other_key$ references and drops the game's inline markup
  # ([Concept(...)] calls, #b ...#! styling, @icon! glyphs).
  def text(key, depth = 0)
    raw = loc[key]
    return nil unless raw
    raw = raw.gsub(/\$([\w.\-]+)(?:\|[^$]*)?\$/) { depth < 5 ? (text($1, depth + 1) || $1) : $1 }
    raw = raw.gsub(/\[Concept\('[^']*',\s*'([^']*)'\)\]/) { $1 }
             .gsub(/\[concept_(\w+)\]/) { text("concept_#{$1}", depth + 1) || $1.tr("_", " ") }
             .gsub(/\[[^\]]*\]/, "")
             .gsub(/#\w+\s?|#!/, "").gsub(/@\w+!/, "").gsub("\\n", "\n")
    raw.strip
  end

  def humanize(id) = id.sub(/\A(pm|law|building|combat_unit_type|ship_type)_/, "").tr("_", " ").capitalize

  # Everything needed to estimate research time: base cost per era, the
  # innovation every country gets for free, and the extra cost the game
  # charges for researching past techs you're missing from earlier eras.
  def research_rules
    base = Vic3Script.value(read(@game.join("common/static_modifiers/00_code_static_modifiers.txt")), "base_values")
    penalty = File.read(@game.join("common/defines/00_defines.txt"), encoding: "UTF-8")[/TECH_AHEAD_OF_TIME_PENALTY_FACTOR\s*=\s*([\d.]+)/, 1]
    {
      era_cost: files("technology/eras").flat_map { |f| read(f) }.to_h { |era, _, body| [era, Vic3Script.value(body, "technology_cost").to_i] },
      base_innovation: Vic3Script.value(base, "country_weekly_innovation_add").to_f,
      ahead_of_time_penalty: penalty.to_f
    }
  end

  def extract_techs
    files("technology/technologies").flat_map { |f| read(f) }.each_with_object({}) do |(id, _, body), techs|
      next unless body.is_a?(Array)
      modifiers = (Vic3Script.value(body, "modifier") || []).filter_map do |key, _, value|
        next unless key && value.is_a?(String)
        { key: key, name: text(key) || humanize(key), value: value.to_f }
      end
      techs[id] = {
        id: id,
        name: text(id) || humanize(id),
        desc: text("#{id}_desc"),
        era: Vic3Script.value(body, "era"),
        category: Vic3Script.value(body, "category"),
        texture: Vic3Script.value(body, "texture"),
        requires: Vic3Script.list(Vic3Script.value(body, "unlocking_technologies")),
        modifiers: modifiers,
        unlocks: []
      }
    end
  end

  def add_unlocks(techs)
    UNLOCK_DIRS.each do |dir, kind|
      files(dir).flat_map { |f| read(f) }.each do |id, _, body|
        next unless body.is_a?(Array)
        Vic3Script.list(Vic3Script.value(body, "unlocking_technologies")).each do |tech|
          techs[tech]&.dig(:unlocks)&.push({ kind: kind, name: text(id) || humanize(id) })
        end
      end
    end
  end

  def extract_countries(techs)
    by_era = techs.values.group_by { |t| t[:era] }.transform_values { |ts| ts.map { |t| t[:id] } }
    tiers = read(@game.join("common/scripted_effects/00_starting_inventions.txt")).to_h do |name, _, body|
      ids = []
      Vic3Script.walk(body) do |k, v|
        ids.concat(by_era.fetch(v, [])) if k == "add_era_researched"
        ids << v if k == "add_technology_researched"
      end
      [name, ids]
    end

    owners = Dir[@game.join("common/history/states/*.txt")].flat_map { |f| File.read(f, encoding: "UTF-8").scan(/country\s*=\s*c:(\w+)/).flatten }.to_set
    countries = Hash.new do |h, tag|
      h[tag] = { tag: tag, name: text(tag) || tag, exists: owners.include?(tag),
                 tier: nil, techs: [], region: nil, army: {}, navy: {} }
    end

    Dir[@game.join("common/history/countries/*.txt")].sort.each do |f|
      read(f).each do |_, _, top|
        next unless top.is_a?(Array)
        top.each do |scope, _, body|
          next unless scope&.start_with?("c:") && body.is_a?(Array)
          country = countries[scope.delete_prefix("c:")]
          Vic3Script.walk(body) do |k, v|
            if (m = k&.match(/\Aeffect_starting_technology_tier_(\d+)_tech\z/))
              country[:tier] = m[1].to_i
              country[:techs].concat(tiers.fetch(k, []))
            elsif k == "add_technology_researched"
              country[:techs] << v
            end
          end
        end
      end
    end
    countries.each_value { |c| c[:techs] = c[:techs].uniq.select { |t| techs.key?(t) } }
    owners.each { |tag| countries[tag] }
    country_regions.each { |tag, region| countries[tag][:region] = region }
    countries
  end

  # map_data/state_regions/NN_<name>.txt -> the region the page groups by.
  MAP_REGIONS = {
    "west_europe" => "europe", "south_europe" => "europe", "east_europe" => "europe", "russia" => "asia",
    "north_africa" => "north_africa", "subsaharan_africa" => "subsaharan_africa", "middle_east" => "middle_east",
    "north_america" => "north_america", "central_america" => "north_america", "south_america" => "south_america",
    "central_asia" => "asia", "india" => "india", "east_asia" => "asia", "indonesia" => "asia", "siberia" => "asia",
    "australasia" => "oceania"
  }.freeze

  # Each country's region is where its capital is (country_definitions),
  # falling back to wherever most of its 1836 provinces are. Not by majority
  # alone: that puts Britain in North America and Russia in Asia. (Regions
  # used to come from which army-formation file mentions a country, which
  # left every country without a starting army -- Switzerland, most of the
  # world -- with no region at all, so the page never listed them.)
  def country_regions
    provinces = Hash.new { |h, tag| h[tag] = Hash.new(0) }
    read(@game.join("common/history/states/00_states.txt")).each do |_, _, top|
      next unless top.is_a?(Array)
      top.each do |state, _, body|
        region = state_region[state.to_s.delete_prefix("s:")] or next
        Vic3Script.values(body, "create_state").each do |cs|
          tag = Vic3Script.value(cs, "country")&.delete_prefix("c:") or next
          provinces[tag][region] += Vic3Script.list(Vic3Script.value(cs, "owned_provinces")).size
        end
      end
    end
    capitals = country_definitions.transform_values { |body| state_region[Vic3Script.value(body, "capital")] }
    provinces.to_h { |tag, by_region| [tag, capitals[tag] || by_region.max_by(&:last).first] }
  end

  # STATE_X -> page region. The "russia" map file also holds Central Asia and
  # Siberia, so Europe is whatever the game's own European strategic regions
  # cover (which do include European Russia and the Caucasus). Also shipped
  # in data.json, so a loaded save can place countries by their capital.
  def state_region
    @state_region ||= begin
      regions = Dir[@game.join("map_data/state_regions/*.txt")].each_with_object({}) do |f, h|
        region = MAP_REGIONS[File.basename(f, ".txt").sub(/\A\d+_/, "")] or next
        read(f).each { |id, _, _| h[id] = region }
      end
      read(@game.join("common/strategic_regions/europe_strategic_regions.txt")).each do |_, _, body|
        Vic3Script.list(Vic3Script.value(body, "states")).each { |id| regions[id] = "europe" } if body.is_a?(Array)
      end
      regions
    end
  end

  # Every good in the game's own order, which is also the order a save's
  # world-market price history uses -- minus the goods that never reach the
  # world market (local ones like services, and untradeable gold), which is
  # what `market_index` accounts for.
  def extract_goods
    index = -1
    read(@game.join("common/goods/00_goods.txt")).filter_map do |id, _, body|
      next unless body.is_a?(Array)
      tradeable = Vic3Script.value(body, "local") != "yes" && Vic3Script.value(body, "tradeable") != "no"
      index += 1 if tradeable
      {
        id: id, name: text(id) || humanize(id), cost: Vic3Script.value(body, "cost").to_f,
        category: Vic3Script.value(body, "category"), icon: image(Vic3Script.value(body, "texture"), "goods", 64),
        market_index: tradeable ? index : nil
      }
    end
  end

  # Treaties in force at the 1836 start (common/history/treaties). Some are
  # written twice, `if = { limit = { has_dlc_feature = ... } }` with a richer
  # version and `else` without; like the rest of the data, take the DLC one.
  def extract_treaties
    treaties = []
    collect = lambda do |block|
      block.each do |k, _, v|
        next unless v.is_a?(Array)
        case k
        when "create_treaty" then treaties << treaty(v)
        when "if", "TREATIES" then collect.(v)
        end
      end
    end
    collect.(read(@game.join("common/history/treaties/00_historical_treaties.txt")))
    treaties
  end

  def treaty(body)
    tag = ->(v) { v&.delete_prefix("c:") }
    articles = Vic3Script.value(body, "articles_to_create").to_a.filter_map do |_, _, a|
      next unless a.is_a?(Array)
      inputs = Vic3Script.value(a, "inputs").to_a.flat_map { |_, _, i| i.is_a?(Array) ? i : [] }
      {
        article: Vic3Script.value(a, "article"),
        source: tag.(Vic3Script.value(a, "source_country")), target: tag.(Vic3Script.value(a, "target_country")),
        goods: Vic3Script.value(inputs, "goods")&.delete_prefix("g:"),
        quantity: Vic3Script.value(inputs, "quantity")&.to_f,
        state: Vic3Script.value(inputs, "state")&.[](/s:(STATE_\w+)/, 1)
      }.compact
    end
    {
      name: text(Vic3Script.value(body, "name").to_s) || "Treaty",
      countries: [tag.(Vic3Script.value(body, "first_country")), tag.(Vic3Script.value(body, "second_country"))],
      since: Vic3Script.value(body, "entered_into_force_on"),
      years: Vic3Script.value(Vic3Script.value(body, "binding_period").to_a, "years")&.to_i,
      articles: articles
    }
  end

  def country_definitions
    @country_definitions ||= files("country_definitions").flat_map { |f| read(f) }.select { |_, _, b| b.is_a?(Array) }.to_h { |tag, _, body| [tag, body] }
  end

  def add_armies(countries)
    unit_group = {}
    read(@game.join("common/combat_unit_types/00_land_combat_unit_types.txt")).each do |id, _, body|
      unit_group[id] = Vic3Script.value(body, "group")&.delete_prefix("combat_unit_group_") if body.is_a?(Array)
    end

    Dir[@game.join("common/history/military_formations/*.txt")].sort.each do |f|
      region = File.basename(f, ".txt")[/\A\d+_military_formations_(\w+)\z/, 1]
      next if region.nil? || region == "example"
      read(f).each do |_, _, top|
        next unless top.is_a?(Array)
        top.each do |scope, _, body|
          next unless scope&.start_with?("c:") && body.is_a?(Array)
          country = countries[scope.delete_prefix("c:")]
          country[:region] ||= region # only if its states didn't place it -- see country_regions
          Vic3Script.walk(body) do |k, v|
            next unless v.is_a?(Array)
            type = Vic3Script.value(v, "type")
            if k == "combat_unit" && type
              id = type.delete_prefix("unit_type:")
              entry = country[:army][id] ||= { name: text(id) || humanize(id), group: unit_group[id], count: 0 }
              entry[:count] += (Vic3Script.value(v, "count") || 1).to_i
            elsif (k == "ship" || k == "create_ship") && type
              id = type.delete_prefix("ship_type:")
              entry = country[:navy][id] ||= { name: text(id) || humanize(id), count: 0 }
              entry[:count] += (Vic3Script.value(v, "count") || 1).to_i
            end
          end
        end
      end
    end
  end

  def write_icons(techs)
    techs.values.each_with_object({}) do |tech, icons|
      icon = image(tech[:texture], "icons", 96)
      icons[tech[:id]] = icon if icon
    end
  end

  # A game texture -> PNG under public/vic3/<subdir>, at most `size` px on
  # its longest side (never upscaled), via ImageMagick -- macOS `sips`
  # garbles the uncompressed DDS the ship silhouettes use. Skipped when
  # already converted.
  # Returns the path relative to public/vic3, or nil if the game lacks it.
  def image(texture, subdir, size)
    src = texture && @game.join(texture)
    return nil unless src&.exist?
    dir = @out.join(subdir)
    dir.mkpath
    name = "#{File.basename(texture, '.*')}.png"
    dest = dir.join(name)
    system("magick", src.to_s, "-resize", "#{size}x#{size}>", dest.to_s, exception: true) unless dest.exist?
    "#{subdir}/#{name}"
  end

  # `modifier = { key = value ... }` -> [{ key:, name:, value: }], same shape
  # as a tech's own modifiers, so the page formats them all one way.
  def modifiers(block)
    (block || []).filter_map do |key, _, value|
      next unless key && value.is_a?(String) && value.match?(/\A-?[\d.]+\z/)
      { key: key, name: modifier_name(key), value: value.to_f }
    end
  end

  # Battle-condition modifiers localize through a runtime GetBattleCondition
  # call the page can't run, so name them from the condition itself.
  def modifier_name(key)
    if (condition = key[/\Acharacter_battle_condition_(\w+)_mult\z/, 1])
      "#{text("battle_condition_#{condition}") || humanize(condition)} chance"
    else
      text(key) || humanize(key)
    end
  end

  # `goods_input_small_arms_add = 1` -> { name: "Small Arms", value: 1.0 }
  def goods(block)
    (block || []).filter_map do |key, _, value|
      good = key&.[](/\Agoods_input_(\w+)_add\z/, 1)
      { name: text(good) || humanize(good), value: value.to_f } if good
    end
  end

  def technologies_in(block)
    ids = []
    Vic3Script.walk(block || []) { |k, v| ids << v if k == "has_technology_researched" }
    ids.uniq
  end

  # Land units in definition order, which the game keeps oldest-first per
  # group ("the system will determine the default unit type ... by the last
  # defined unit type that it can build").
  def extract_units
    read(@game.join("common/combat_unit_types/00_land_combat_unit_types.txt")).filter_map do |id, _, body|
      next unless body.is_a?(Array)
      fallback = Vic3Script.values(body, "combat_unit_image").find { |img| !Vic3Script.value(img, "trigger") }
      group = Vic3Script.value(body, "group")
      {
        id: id,
        name: text(id) || humanize(id),
        group: group&.delete_prefix("combat_unit_group_"),
        group_name: text(group) || humanize(group.to_s),
        requires: Vic3Script.list(Vic3Script.value(body, "unlocking_technologies")),
        manpower: Vic3Script.value(body, "max_manpower").to_i,
        stats: modifiers(Vic3Script.value(body, "battle_modifier")),
        upkeep: goods(Vic3Script.value(body, "upkeep_modifier")),
        upgrades: Vic3Script.list(Vic3Script.value(body, "upgrades")),
        image: image(fallback && Vic3Script.value(fallback, "texture"), "units", 360)
      }
    end
  end

  def extract_ships
    read(@game.join("common/ship_types/00_ship_types.txt")).filter_map do |id, _, body|
      next unless body.is_a?(Array)
      group = Vic3Script.value(body, "ship_group")
      {
        id: id,
        name: text(id) || humanize(id),
        group: group&.delete_prefix("ship_group_"),
        group_name: text(group) || humanize(group.to_s),
        requires: Vic3Script.list(Vic3Script.value(body, "unlocking_technologies")),
        obsolete_with: technologies_in(Vic3Script.value(body, "is_obsolete")),
        very_obsolete_with: technologies_in(Vic3Script.value(body, "is_very_obsolete")),
        stats: modifiers(Vic3Script.value(body, "modifier")).reject { |m| m[:key].start_with?("ship_battle_against_") },
        construction: goods(Vic3Script.value(body, "construction_goods")),
        materiel: goods(Vic3Script.value(body, "materiel_goods")),
        image: image(Vic3Script.value(body, "profile_texture"), "ships", 360)
      }
    end
  end

  # Top-level building group -> the sector the page groups buildings by.
  SECTORS = {
    "bg_manufacturing" => "industry", "bg_agriculture" => "agriculture", "bg_ranching" => "agriculture",
    "bg_plantations" => "agriculture", "bg_extraction" => "extraction", "bg_infrastructure" => "infrastructure",
    "bg_government" => "government", "bg_military" => "military", "bg_service" => "urban", "bg_urban_facilities" => "urban"
  }.freeze

  # 1836 buildings per country and state (common/history/buildings), plus
  # each state's resource potential (map_data/state_regions). Written to its
  # own economy.json, which the page only loads when that tab is opened.
  #
  # A state region can be split between countries; its arable land and
  # resource caps are shared by the whole region in-game, so each owner is
  # credited with its share of the region's provinces -- an approximation.
  def extract_economy(tags)
    parents = read(@game.join("common/building_groups/00_building_groups.txt")).to_h { |id, _, body| [id, Vic3Script.value(body, "parent_group")] }
    sector_of = ->(group) { group = parents[group] while group && !SECTORS.key?(group) && parents[group]; SECTORS[group] }

    building_defs = files("buildings").flat_map { |f| read(f) }.select { |_, _, body| body.is_a?(Array) }.to_h do |id, _, body|
      [id, { group: Vic3Script.value(body, "building_group"), icon: Vic3Script.value(body, "icon") }]
    end

    regions = Dir[@game.join("map_data/state_regions/*.txt")].sort.flat_map { |f| read(f) }.select { |_, _, b| b.is_a?(Array) }.to_h do |id, _, body|
      discoverable = Vic3Script.values(body, "resource").to_h do |r|
        [Vic3Script.value(r, "type"), { discovered: Vic3Script.value(r, "discovered_amount").to_f, undiscovered: Vic3Script.value(r, "undiscovered_amount").to_f }]
      end
      [id, {
        provinces: Vic3Script.list(Vic3Script.value(body, "provinces")).size,
        arable_land: Vic3Script.value(body, "arable_land").to_f,
        arable: Vic3Script.list(Vic3Script.value(body, "arable_resources")),
        capped: (Vic3Script.value(body, "capped_resources") || []).to_h { |k, _, v| [k, v.to_f] },
        discoverable: discoverable
      }]
    end

    # [state, country] -> { building => levels }
    built = Hash.new { |h, k| h[k] = Hash.new(0) }
    files("history/buildings").flat_map { |f| read(f) }.each do |_, _, top|
      next unless top.is_a?(Array)
      top.each do |state, _, owners|
        next unless state&.start_with?("s:") && owners.is_a?(Array)
        owners.each do |owner, _, body|
          next unless owner&.start_with?("region_state:") && body.is_a?(Array)
          key = [state.delete_prefix("s:"), owner.delete_prefix("region_state:")]
          Vic3Script.walk(body) do |k, v|
            next unless k == "create_building" && v.is_a?(Array)
            levels = Vic3Script.value(v, "level").to_i
            if levels.zero?
              Vic3Script.walk(Vic3Script.value(v, "add_ownership") || []) { |lk, lv| levels += lv.to_i if lk == "levels" }
            end
            built[key][Vic3Script.value(v, "building")] += levels
          end
        end
      end
    end

    countries = Hash.new { |h, tag| h[tag] = { states: [] } }
    read(@game.join("common/history/states/00_states.txt")).each do |_, _, top|
      next unless top.is_a?(Array)
      top.each do |state, _, body|
        next unless state&.start_with?("s:") && body.is_a?(Array)
        id = state.delete_prefix("s:")
        region = regions[id] or next
        Vic3Script.values(body, "create_state").each do |cs|
          tag = Vic3Script.value(cs, "country")&.delete_prefix("c:")
          next unless tags.include?(tag)
          share = region[:provinces].zero? ? 1.0 : [Vic3Script.list(Vic3Script.value(cs, "owned_provinces")).size.to_f / region[:provinces], 1.0].min
          countries[tag][:states] << {
            id: id, name: text(id) || humanize(id.delete_prefix("STATE_")), share: share.round(3),
            arable_land: region[:arable_land], arable: region[:arable], capped: region[:capped],
            discoverable: region[:discoverable], buildings: built[[id, tag]].reject { |_, n| n.zero? }
          }
        end
      end
    end

    # Every building type, not just the ones standing in 1836 -- a loaded
    # save has power plants, motor industries and so on. Left out: military
    # buildings (most starting barracks come from the army formations rather
    # than these files -- Prussia would show 2 levels for 128 battalions --
    # and the Armies tab covers the military anyway) and subsistence farms
    # (every rural state has them; they'd swamp agriculture in a save).
    # Monuments sit in a group with no parent; they count as government.
    buildings = building_defs.filter_map do |id, d|
      next if d[:group].to_s.include?("subsistence")
      sector = sector_of.(d[:group]) || "government"
      next if sector == "military"
      [id, { name: text(id) || humanize(id), group: d[:group], group_name: text(d[:group]) || humanize(d[:group].to_s),
             sector: sector, icon: image(d[:icon], "buildings", 64) }]
    end.to_h
    countries.each_value { |c| c[:states].each { |st| st[:buildings].select! { |id, _| buildings.key?(id) } } }

    # Every state region, for loaded saves: they say which country owns which
    # provinces of a region, so its resources can be split exactly.
    region_info = regions.to_h do |id, r|
      [id, { name: text(id) || humanize(id.delete_prefix("STATE_")), **r.slice(:provinces, :arable_land, :arable, :capped, :discoverable) }]
    end

    { buildings: buildings, regions: region_info, countries: countries.sort.to_h }
  end

  # principle_military_industry_3 -> "Militarized Industry (level 3)"
  def principle_name(id)
    group, level = id.delete_prefix("principle_").match(/\A(\w+?)_(\d+)\z/)&.captures
    "#{text("principle_group_#{group}") || humanize(group.to_s)} (level #{level})"
  end

  def extract_mobilization
    read(@game.join("common/mobilization_options/00_mobilization_option.txt")).filter_map do |id, _, body|
      next unless body.is_a?(Array)
      group = Vic3Script.value(body, "group")
      {
        id: id,
        name: text(id) || humanize(id.delete_prefix("mobilization_option_")),
        desc: text("#{id}_desc"),
        group: group,
        group_name: text("mobilization_option_group_#{group}") || text(group.to_s) || humanize(group.to_s),
        requires: Vic3Script.list(Vic3Script.value(body, "unlocking_technologies")),
        also_requires: technologies_in(Vic3Script.value(body, "possible")),
        principles: Vic3Script.list(Vic3Script.value(body, "unlocking_principles")).map { |id| principle_name(id) },
        market_goods: Vic3Script.value(body, "possible").to_s.scan(/"mg:(\w+)"/).flatten.uniq.map { |g| text(g) || humanize(g) },
        effects: modifiers(Vic3Script.value(body, "unit_modifier")),
        upkeep: goods(Vic3Script.value(body, "upkeep_modifier")),
        icon: image(Vic3Script.value(body, "texture"), "mobilization", 96)
      }
    end
  end
end

if $PROGRAM_NAME == __FILE__
  game_dir = ARGV[0] || ENV.fetch("VIC3_GAME_DIR",
    File.expand_path("~/Library/Application Support/Steam/steamapps/common/Victoria 3/game"))
  Vic3Extractor.new(game_dir, File.expand_path("vic3", __dir__)).call
end
