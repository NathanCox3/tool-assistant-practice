import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate, get_weather, search_notes, tools } from './assistant.mjs';

test('has exactly the three practice tools', () => {
  assert.deepEqual(tools.map((tool) => tool.name), ['get_weather', 'calculate', 'search_notes']);
});

test('get_weather reads live weather data from fetch', async () => {
  // The real app calls Open-Meteo. The test replaces fetch so it is fast,
  // repeatable, and does not depend on the network.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://geocoding-api.open-meteo.com')) {
      return okJson({
        results: [{ name: 'Seattle', country: 'United States', latitude: 47.61, longitude: -122.33 }],
      });
    }

    return okJson({
      current: {
        temperature_2m: 52.7,
        apparent_temperature: 50.1,
        weather_code: 61,
        wind_speed_10m: 8.4,
      },
    });
  };

  try {
    assert.equal(await get_weather({ city: 'Seattle' }), 'Seattle, United States | 53 F | feels like 50 F | rain | 8 mph wind');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('calculate evaluates basic arithmetic', () => {
  assert.equal(calculate({ expression: '(42 + 18) / 3' }), 20);
});

test('search_notes searches the hardcoded notes object', () => {
  assert.deepEqual(search_notes({ query: 'debugging' }), [
    ['debugging', 'Print tool calls so you can watch what the model decided to do.'],
  ]);
});

function okJson(data) {
  return {
    ok: true,
    json: async () => data,
  };
}
