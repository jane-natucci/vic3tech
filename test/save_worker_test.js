// vic3/save-worker.js: reading a melted save into the per-country summary the page shows. The save below is written
// by hand in the game's format (one tab per nesting level), with one or two entries in every section the reader uses.
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.self = {};
await import("../vic3/save-worker.js");

// Runs the worker on a save's text, the way the page does in its Web Worker.
function readSave(text) {
  return new Promise((resolve, reject) => {
    self.postMessage = m => {
      if (m.type === "done") resolve(m.summary);
      if (m.type === "error") reject(new Error(m.message));
    };
    self.onmessage({ data: new Blob([text]) });
  });
}

// Indents a block written with leading spaces (2 per level) into the game's tabs.
const tabs = s => s.replace(/^\n/, "").replace(/^( +)/gm, sp => "\t".repeat(sp.length / 2));

const SAVE = "SAV0102000000000000000000\n" + tabs(`
date=1841.3.8
player_manager={
  database={
    0={
      user="Tester"
      country=1
    }
  }
}
country_manager={
  database={
    0={
      definition="GBR"
      capital=10
      gdp={
        channels={
          0={
            values={
              100 200 300
            }
          }
        }
      }
      prestige={
        channels={
          0={
            values={
              50 60
            }
          }
        }
      }
      country_type="recognized"
    }
    1={
      definition="FRA"
      capital=11
      country_type="recognized"
    }
    2={
      definition="KUT"
      capital=4294967295
    }
    3=none
  }
}
technology={
  database={
    0={
      country=0
      acquired_technologies={
        "navigation" "drydocks"
      }
    }
  }
}
laws={
  database={
    0={
      law="law_monarchy"
      country=0
      active=yes
    }
    1={
      law="law_peasant_levies"
      country=0
    }
    2={
      law="law_professional_army"
      country=0
      active=yes
      activation_date=1840.1.1
    }
  }
}
states={
  database={
    10={
      country=0
      region="STATE_AVALON"
      arable_land=35
      provinces={
        provinces={
          100 2 200 0
        }
      }
      trade={
        goods={
          2={
            value=-3.5
          }
          0={
            value=1.5
          }
        }
      }
    }
    11={
      country=1
      region="STATE_BRETLAND"
      arable_land=12
      provinces={
        provinces={
          300 1
        }
      }
    }
    12={
      country=0
      region="STATE_EMPTY"
      arable_land=0
      provinces={ }
    }
  }
}
building_manager={
  database={
    0={
      building="building_textile_mill"
      levels=5
      state=10
    }
    1={
      building="building_trade_center"
      levels=2
      state=10
      trade_revenue=120.5
      profit_after_reserves=30
    }
    2={
      building="building_wheat_farm"
      levels=3
      state=11
    }
    3={
      building="building_wheat_farm"
      levels=0
      state=11
    }
    4={
      building="building_iron_mine"
      levels=1
      state=99
    }
  }
}
new_combat_unit_manager={
  database={
    0={
      current_manpower=1000
      type="combat_unit_type_line_infantry"
      country=0
    }
    1={
      current_manpower=600
      type="combat_unit_type_line_infantry"
      country=0
    }
    2={
      current_manpower=1000
      type="combat_unit_type_hussars"
      country=1
    }
  }
}
military_formation_manager={
  database={
    5={
      country=1
      type=fleet
    }
  }
}
ship_templates_manager={
  database={
    0={
      type="ship_type_frigate"
      country=0
      versions={
        0 1
      }
    }
    1={
      type="ship_type_ship_of_the_line"
      country=0
      versions={
        2
      }
    }
  }
}
ship_manager={
  database={
    0={
      fleet=5
      version=0
    }
    1={
      fleet=99
      version=2
    }
    2={
      fleet=99
      version=1
    }
  }
}
market_manager={
  world_market={
    price_trend={
      channels={
        0={
          values={
            50 51
            52
          }
        }
        1={
          values={
            20 19
          }
        }
      }
    }
  }
}
treaty_manager={
  database={
    0={
      first_country=0
      second_country=1
      entered_into_force_on=1835.5.1
      binding_period=3650
    }
    1={
      first_country=0
      second_country=1
    }
  }
}
treaty_article_manager={
  database={
    0={
      article="money_transfer"
      treaty=0
      source_country=1
      target_country=0
      inputs={
        { quantity=25.5 }
      }
    }
    1={
      article="goods_transfer"
      treaty=0
      source_country=0
      target_country=1
      inputs={
        { goods="grain" }
        { quantity=10 }
      }
    }
  }
}
`);

const summary = await readSave(SAVE);
const country = tag => summary.countries.find(c => c.tag === tag);

test("reads the date and the player's country", () => {
  assert.equal(summary.date, "1841.3.8");
  assert.equal(summary.player, "FRA");
});

test("keeps only countries that still own a state", () => {
  assert.deepEqual(summary.countries.map(c => c.tag), ["GBR", "FRA"]);
});

test("a country's capital region, techs, prestige and GDP (the last value of each history)", () => {
  const gbr = country("GBR");
  assert.equal(gbr.capitalRegion, "STATE_AVALON");
  assert.deepEqual(gbr.techs, ["navigation", "drydocks"]);
  assert.equal(gbr.prestige, 60);
  assert.equal(gbr.gdp, 300);
});

test("only active laws, with the date a law was enacted", () => {
  assert.deepEqual(country("GBR").laws, [
    { id: "law_monarchy", since: null },
    { id: "law_professional_army", since: "1840.1.1" },
  ]);
});

test("battalions are counted per unit type, with their real manpower", () => {
  assert.deepEqual(country("GBR").army, { combat_unit_type_line_infantry: { count: 2, manpower: 1600 } });
  assert.deepEqual(country("FRA").army, { combat_unit_type_hussars: { count: 1, manpower: 1000 } });
});

test("ships belong to their fleet's country, else to their template's", () => {
  assert.deepEqual(country("FRA").navy, { ship_type_frigate: 1 });
  assert.deepEqual(country("GBR").navy, { ship_type_ship_of_the_line: 1, ship_type_frigate: 1 });
});

test("states: provinces counted from id ranges, buildings with levels, trade flows and the trade center's money", () => {
  const [avalon] = country("GBR").states;
  assert.equal(avalon.region, "STATE_AVALON");
  assert.equal(avalon.arable_land, 35);
  assert.equal(avalon.provinces, 4); // "100 2" is 3 provinces, "200 0" is 1
  assert.deepEqual(avalon.buildings, { building_textile_mill: 5, building_trade_center: 2 });
  assert.deepEqual(avalon.trade, { 2: -3.5, 0: 1.5 });
  assert.deepEqual(avalon.tradeCenter, { revenue: 120.5, profit: 30 });
  assert.deepEqual(country("FRA").states[0].buildings, { building_wheat_farm: 3 }, "level-0 buildings are left out");
});

test("a block written on one line: provinces={ } (a state that has lost all its provinces)", () => {
  const empty = country("GBR").states.find(s => s.region === "STATE_EMPTY");
  assert.equal(empty.provinces, 0);
});

test("treaties with their articles; treaties without any are left out", () => {
  assert.deepEqual(summary.treaties, [{
    countries: ["GBR", "FRA"], since: "1835.5.1", days: 3650,
    articles: [
      { article: "money_transfer", source: "FRA", target: "GBR", goods: null, quantity: 25.5 },
      { article: "goods_transfer", source: "GBR", target: "FRA", goods: "grain", quantity: 10 },
    ],
  }]);
});

test("world market price history, one list per good, oldest first", () => {
  assert.deepEqual(summary.prices, [[50, 51, 52], [20, 19]]);
});

test("a binary (unmelted) save is turned away with a hint", async () => {
  await assert.rejects(readSave("SAV0102\u0000\u0001binary"), /still binary.*Melt it on pdx\.tools/);
});

test("a text file that isn't a save is turned away", async () => {
  await assert.rejects(readSave("hello=world\n"), /doesn't look like a melted Victoria 3 save/);
});
