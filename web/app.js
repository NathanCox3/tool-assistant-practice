// This public webpage runs fully in the browser.
// It does not use your OpenAI API key because public webpages cannot hide secrets.
// Instead, it demonstrates the same three-tool idea with simple intent routing:
// weather questions call getWeather, math questions call calculate, and note
// questions call searchNotes.

const notes = {
  project: 'Build a tiny assistant with weather, calculator, and notes tools.',
  debugging: 'Print tool calls so you can watch what the model decided to do.',
  groceries: 'Coffee, oats, blueberries, sparkling water.',
};

const form = document.querySelector('#assistant-form');
const input = document.querySelector('#question');
const answerText = document.querySelector('#answer-text');
const traceList = document.querySelector('#trace-list');
const quickButtons = document.querySelectorAll('[data-prompt]');

quickButtons.forEach((button) => {
  button.addEventListener('click', () => {
    input.value = button.dataset.prompt;
    form.requestSubmit();
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const question = input.value.trim();
  if (!question) return;

  answerText.textContent = 'Thinking...';
  setTrace(['Reading the question.']);

  try {
    const decision = chooseTool(question);
    setTrace([
      `Decision: ${decision.tool}`,
      `Arguments: ${JSON.stringify(decision.args)}`,
      'Running the selected tool.',
    ]);

    const result = await runTool(decision);
    answerText.textContent = result.answer;
    setTrace([
      `Decision: ${decision.tool}`,
      `Tool call: ${decision.tool}(${JSON.stringify(decision.args)})`,
      `Tool result: ${result.raw}`,
    ]);
  } catch (error) {
    answerText.textContent = error.message;
    setTrace(['The request could not be completed.']);
  }
});

function chooseTool(question) {
  const text = question.toLowerCase();

  if (text.includes('weather') || text.includes('temperature') || text.includes('forecast')) {
    return { tool: 'get_weather', args: { city: findCity(question) } };
  }

  const expression = findMathExpression(question);
  if (expression) {
    return { tool: 'calculate', args: { expression } };
  }

  if (text.includes('note') || text.includes('search') || text.includes('debug') || text.includes('grocery')) {
    return { tool: 'search_notes', args: { query: findNoteQuery(question) } };
  }

  return { tool: 'search_notes', args: { query: question } };
}

async function runTool(decision) {
  if (decision.tool === 'get_weather') {
    const weather = await getWeather(decision.args.city);
    return {
      raw: weather,
      answer: `Current weather: ${weather}`,
    };
  }

  if (decision.tool === 'calculate') {
    const value = calculate(decision.args.expression);
    return {
      raw: String(value),
      answer: `${decision.args.expression} = ${value}`,
    };
  }

  const matches = searchNotes(decision.args.query);
  return {
    raw: JSON.stringify(matches),
    answer: matches.length
      ? matches.map(([title, body]) => `${title}: ${body}`).join(' ')
      : 'No matching notes found.',
  };
}

async function getWeather(city) {
  const placeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  placeUrl.search = new URLSearchParams({
    name: city,
    count: '1',
    language: 'en',
    format: 'json',
  });

  const placeData = await fetchJson(placeUrl);
  const place = placeData.results?.[0];
  if (!place) return `I could not find live weather for "${city}".`;

  const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
  weatherUrl.search = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto',
  });

  const weatherData = await fetchJson(weatherUrl);
  const current = weatherData.current;
  if (!current) return `Live weather was unavailable for "${place.name}".`;

  return [
    `${place.name}, ${place.country}`,
    `${Math.round(current.temperature_2m)} F`,
    `feels like ${Math.round(current.apparent_temperature)} F`,
    weatherCodeToText(current.weather_code),
    `${Math.round(current.wind_speed_10m)} mph wind`,
  ].join(' | ');
}

function calculate(expression) {
  if (!/^[\d\s+\-*/().%]+$/.test(expression)) return 'Only basic arithmetic is allowed.';
  return Function(`"use strict"; return (${expression})`)();
}

function searchNotes(query) {
  const q = query.toLowerCase();
  return Object.entries(notes).filter(([title, body]) => `${title} ${body}`.toLowerCase().includes(q));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  return response.json();
}

function findCity(question) {
  const match = question.match(/\b(?:in|for|at)\s+([a-zA-Z\s]+)\??$/);
  return match ? match[1].trim() : question.replace(/weather|temperature|forecast|what is|what's/gi, '').trim();
}

function findMathExpression(question) {
  const symbolExpression = question.match(/[\d\s+\-*/().%]{3,}/);
  if (symbolExpression) return symbolExpression[0].trim();

  const wordMultiply = question.match(/(\d+)\s*(?:times|x|multiplied by)\s*(\d+)/i);
  if (wordMultiply) return `${wordMultiply[1]} * ${wordMultiply[2]}`;

  return '';
}

function findNoteQuery(question) {
  return question
    .replace(/search/gi, '')
    .replace(/notes?/gi, '')
    .replace(/for/gi, '')
    .trim();
}

function weatherCodeToText(code) {
  if (code === 0) return 'clear sky';
  if ([1, 2, 3].includes(code)) return 'partly cloudy';
  if ([45, 48].includes(code)) return 'foggy';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunderstorm';
  return `weather code ${code}`;
}

function setTrace(items) {
  traceList.innerHTML = '';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    traceList.append(li);
  });
}
