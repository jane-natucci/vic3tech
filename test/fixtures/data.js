// Small, made-up stand-ins for vic3/data.json and vic3/economy.json (the real ones are Paradox's data and aren't in
// this repo). Same shape as what extract.rb writes, with just enough in them to exercise the page's logic:
// three eras, ten techs, three countries, a few units, ships, laws, goods and one treaty.
const tech = (id, era, category, requires = [], extra = {}) => ({
  id, name: id.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase()), desc: `About ${id}.`, era, category, requires,
  modifiers: [], unlocks: [], icon: `icons/${id}.png`, ...extra,
});

export const data = () => ({
  generated_at: "2026-11-19T21:25:33Z",
  game_version: "1.15.2",
  eras: ["era_1", "era_2", "era_3"],
  categories: ["production", "military", "society"],
  research: { era_cost: { era_1: 7500, era_2: 10000, era_3: 12500 }, base_innovation: 50, ahead_of_time_penalty: 0.25 },
  country_names: { GBR: "Great Britain", FRA: "France", JAP: "Japan" },
  state_regions: { STATE_AVALON: "europe", STATE_BRETLAND: "europe", STATE_KYUSHU: "asia" },
  techs: [
    tech("enclosure", "era_1", "production"),
    tech("steelworking", "era_2", "production", ["enclosure"]),
    tech("navigation", "era_1", "military"),
    tech("drydocks", "era_1", "military", ["navigation"]),
    tech("standing_army", "era_1", "military", [], { modifiers: [{ key: "unit_offense_mult", name: "Offense", value: 0.1 }] }),
    tech("gunsmithing", "era_2", "military", ["standing_army"]),
    tech("admiralty", "era_2", "military", ["drydocks"]),
    tech("general_staff", "era_2", "military", ["gunsmithing"]),
    tech("ironclad_tech", "era_3", "military", ["admiralty"]),
    tech("urbanization", "era_1", "society"),
    tech("rationalism", "era_2", "society", ["urbanization", "standing_army"]),
  ],
  countries: [
    { tag: "GBR", name: "Great Britain", tier: 1, region: "europe",
      techs: ["enclosure", "navigation", "drydocks", "standing_army", "gunsmithing", "urbanization"],
      army: { combat_unit_type_line_infantry: { name: "Line Infantry", group: "infantry", count: 10 },
              combat_unit_type_hussars: { name: "Hussars", group: "cavalry", count: 2 } },
      navy: { ship_type_ship_of_the_line: { name: "Ship of the Line", count: 5 }, ship_type_frigate: { name: "Frigate", count: 3 } },
      laws: ["law_monarchy", "law_professional_army", "law_no_home_affairs"] },
    { tag: "FRA", name: "France", tier: 2, region: "europe",
      techs: ["enclosure", "navigation", "standing_army"],
      army: { combat_unit_type_line_infantry: { name: "Line Infantry", group: "infantry", count: 20 } },
      navy: { ship_type_frigate: { name: "Frigate", count: 2 } },
      laws: ["law_monarchy", "law_peasant_levies", "law_no_home_affairs"] },
    { tag: "JAP", name: "Japan", tier: 5, region: "asia",
      techs: [],
      army: { combat_unit_type_irregular_infantry: { name: "Irregular Infantry", group: "infantry", count: 4 } },
      navy: {},
      laws: ["law_monarchy", "law_peasant_levies"] },
  ],
  units: [
    { id: "combat_unit_type_irregular_infantry", name: "Irregular Infantry", group: "infantry", group_name: "Infantry", requires: [], manpower: 1000,
      stats: [{ key: "unit_offense_add", name: "Offense", value: 10 }, { key: "unit_defense_add", name: "Defense", value: 10 }], upkeep: [], image: "units/irregular.png" },
    { id: "combat_unit_type_line_infantry", name: "Line Infantry", group: "infantry", group_name: "Infantry", requires: ["gunsmithing"], manpower: 1000,
      stats: [{ key: "unit_offense_add", name: "Offense", value: 20 }, { key: "unit_defense_add", name: "Defense", value: 25 }], upkeep: [{ name: "Small Arms", value: 1 }], image: "units/line.png" },
    // Two techs: the game treats them as "any of these".
    { id: "combat_unit_type_hussars", name: "Hussars", group: "cavalry", group_name: "Cavalry", requires: ["general_staff", "standing_army"], manpower: 1000,
      stats: [{ key: "unit_offense_add", name: "Offense", value: 15 }], upkeep: [], image: "units/hussars.png" },
  ],
  ships: [
    { id: "ship_type_frigate", name: "Frigate", group: "light_ships", group_name: "Light Ships", requires: ["navigation"], obsolete_with: ["ironclad_tech"],
      very_obsolete_with: [], stats: [{ key: "ship_armor_add", name: "Ship Armor", value: 5 }], construction: [{ name: "Hardwood", value: 50 }], materiel: [], image: "ships/frigate.png" },
    { id: "ship_type_ship_of_the_line", name: "Ship of the Line", group: "capital_ships", group_name: "Capital Ships", requires: ["drydocks"], obsolete_with: ["ironclad_tech"],
      very_obsolete_with: [], stats: [{ key: "ship_armor_add", name: "Ship Armor", value: 12 }, { key: "ship_power_projection_add", name: "Ship Power Projection", value: 100 }], construction: [], materiel: [], image: "ships/sotl.png" },
    { id: "ship_type_ironclad", name: "Ironclad", group: "capital_ships", group_name: "Capital Ships", requires: ["ironclad_tech"], obsolete_with: [],
      very_obsolete_with: [], stats: [{ key: "ship_armor_add", name: "Ship Armor", value: 40 }], construction: [], materiel: [], image: "ships/ironclad.png" },
  ],
  mobilization: [
    { id: "mobilization_option_basic_supplies", name: "Basic Supplies", desc: "Bare minimum.", group: "supplies", group_name: "Supplies", requires: [], also_requires: [],
      principles: [], market_goods: [], effects: [], upkeep: [{ name: "Grain", value: 0.75 }], icon: "mobilization/basic.png" },
    { id: "mobilization_option_bloc_drill", name: "Bloc Drill", desc: "Needs a power bloc.", group: "training", group_name: "Training", requires: [], also_requires: [],
      principles: ["Military Coordination"], market_goods: ["Small Arms"], effects: [], upkeep: [], icon: "mobilization/drill.png" },
  ],
  law_groups: [
    { id: "lawgroup_governance_principles", name: "Governance Principles", category: "power_structure", category_name: "Power structure",
      laws: ["law_monarchy", "law_presidential_republic", "law_subjecthood"] },
    { id: "lawgroup_army_model", name: "Army Model", category: "power_structure", category_name: "Power structure",
      laws: ["law_peasant_levies", "law_professional_army"] },
    { id: "lawgroup_internal_security", name: "Internal Security", category: "human_rights", category_name: "Human rights",
      laws: ["law_no_home_affairs", "law_third_section"] },
  ],
  laws: {
    law_monarchy: { name: "Monarchy", group: "lawgroup_governance_principles", desc: "A crown.", progressiveness: 0, techs: [], modifiers: [], icon: "laws/monarchy.png" },
    law_presidential_republic: { name: "Presidential Republic", group: "lawgroup_governance_principles", desc: "A president.", progressiveness: 50, techs: ["rationalism"], modifiers: [], icon: "laws/republic.png" },
    law_subjecthood: { name: "Subjecthood", group: "lawgroup_governance_principles", desc: "Needs a monarchy.", progressiveness: -10, techs: [], laws: ["law_presidential_republic"], modifiers: [], icon: "" },
    law_peasant_levies: { name: "Peasant Levies", group: "lawgroup_army_model", desc: "Conscripts.", progressiveness: -50, techs: [], modifiers: [{ key: "unit_morale_loss_mult", name: "Morale Loss", value: 0.1 }], icon: "" },
    law_professional_army: { name: "Professional Army", group: "lawgroup_army_model", desc: "Soldiers.", progressiveness: 0, techs: ["standing_army"], modifiers: [], icon: "" },
    law_no_home_affairs: { name: "No Home Affairs", group: "lawgroup_internal_security", desc: "Nothing.", progressiveness: 25, techs: [], modifiers: [], icon: "" },
    law_third_section: { name: "Third Section", group: "lawgroup_internal_security", desc: "Russia only.", progressiveness: -25, techs: [], only: ["RUS"], modifiers: [], icon: "" },
  },
  // The order matters: a save's price history is numbered by position in this list.
  goods: [
    { id: "ammunition", name: "Ammunition", cost: 50, traded_quantity: 5, category: "military", icon: "goods/ammunition.png", market_index: 0 },
    { id: "copper", name: "Copper", cost: 40, traded_quantity: 10, category: "industrial", icon: "goods/copper.png", market_index: 1 },
    { id: "grain", name: "Grain", cost: 20, traded_quantity: 10, category: "staple", icon: "goods/grain.png", market_index: 2 },
    { id: "services", name: "Services", cost: 30, traded_quantity: 10, category: "luxury", icon: "goods/services.png", market_index: null },
  ],
  treaty_articles: { money_transfer: "Money Transfer", goods_transfer: "Goods Transfer", defensive_pact: "Defensive Pact" },
  treaties: [
    { name: "Treaty of Example", countries: ["GBR", "FRA"], since: "1815.10.26", years: 35, articles: [
      { article: "money_transfer", source: "FRA", target: "GBR", quantity: 100 },
      { article: "goods_transfer", source: "GBR", target: "FRA", goods: "grain", quantity: 10 },
      { article: "defensive_pact" },
    ] },
  ],
});

const state = (id, name, share, arable_land, buildings, extra = {}) => ({
  id, name, share, arable_land, arable: ["building_wheat_farm"], capped: {}, discoverable: {}, buildings, ...extra,
});

export const economy = () => ({
  buildings: {
    building_textile_mill: { name: "Textile Mills", sector: "industry", icon: "buildings/textile.png" },
    building_wheat_farm: { name: "Wheat Farms", sector: "agriculture", icon: "buildings/wheat.png" },
    building_iron_mine: { name: "Iron Mines", sector: "extraction", icon: "buildings/iron.png" },
    building_gold_mine: { name: "Gold Mines", sector: "extraction", icon: "buildings/gold.png" },
    building_trade_center: { name: "Trade Center", sector: "infrastructure", icon: "buildings/trade.png" },
  },
  regions: {
    STATE_AVALON: { name: "Avalon", provinces: 10, arable_land: 40, arable: ["building_wheat_farm"], capped: { building_iron_mine: 20 },
                    discoverable: { building_gold_mine: { discovered: 1, undiscovered: 4 } } },
    STATE_BRETLAND: { name: "Bretland", provinces: 4, arable_land: 20, arable: ["building_wheat_farm"], capped: { building_iron_mine: 10 }, discoverable: {} },
    STATE_KYUSHU: { name: "Kyushu", provinces: 6, arable_land: 30, arable: ["building_wheat_farm"], capped: {}, discoverable: {} },
  },
  countries: {
    GBR: { states: [
      state("STATE_AVALON", "Avalon", 1, 40, { building_textile_mill: 5, building_wheat_farm: 3, building_trade_center: 2 },
            { capped: { building_iron_mine: 20 }, discoverable: { building_gold_mine: { discovered: 1, undiscovered: 4 } } }),
      state("STATE_BRETLAND", "Bretland", 0.5, 20, { building_iron_mine: 4 }, { capped: { building_iron_mine: 10 } }),
    ] },
    FRA: { states: [state("STATE_BRETLAND", "Bretland", 0.5, 20, { building_wheat_farm: 6 }, { capped: { building_iron_mine: 10 } })] },
    JAP: { states: [state("STATE_KYUSHU", "Kyushu", 1, 30, { building_wheat_farm: 2 })] },
  },
});
