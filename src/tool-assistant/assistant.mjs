import OpenAI from 'openai';

// This file has the assistant logic.
// Think of it as three parts:
// 1. Tool definitions: the menu of tools the model can choose from.
// 2. Tool functions: the JavaScript code that actually does the work.
// 3. The chat loop: send a question to the model, run tools if needed,
//    then send tool results back so the model can answer.

// The model can be changed from the terminal:
//   OPENAI_MODEL=gpt-5.4 npm run tool-assistant
// If you do not set it, this beginner demo uses the smaller default.
const model = process.env.OPENAI_MODEL || 'gpt-5.4-mini';

// This is our tiny "database" for the notes search tool.
// Keeping it hardcoded makes the tool-calling flow easy to see.
const notes = {
  project: 'Build a tiny assistant with weather, calculator, and notes tools.',
  debugging: 'Print tool calls so you can watch what the model decided to do.',
  groceries: 'Coffee, oats, blueberries, sparkling water.',
};

// These schemas are the menu of tools the model is allowed to call.
// The model only sees the name, description, and JSON parameter schema.
// It does NOT run JavaScript by itself. It asks for a tool, then our code
// below runs the matching JavaScript function.
export const tools = [
  {
    // This tells OpenAI, "Here is a function-like tool."
    type: 'function',

    // This name must match a real JavaScript function later in this file.
    name: 'get_weather',

    // The description helps the model decide WHEN to call this tool.
    description: 'Get live current weather for a city.',

    // Strict means the model must follow this parameter shape exactly.
    strict: true,

    // This says get_weather needs one argument: { city: "Seattle" }.
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { city: { type: 'string' } },
      required: ['city'],
    },
  },
  {
    type: 'function',
    name: 'calculate',
    description: 'Calculate a basic arithmetic expression.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { expression: { type: 'string' } },
      required: ['expression'],
    },
  },
  {
    type: 'function',
    name: 'search_notes',
    description: 'Search hardcoded notes by title or body.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
];

export async function get_weather({ city }) {
  // This function is async because live weather requires internet requests.
  // The model might ask for get_weather({ city: "Seattle" }), but THIS code
  // is what actually contacts the weather API.

  // Step 1: turn a city name into latitude and longitude.
  // Open-Meteo's weather API needs coordinates, not just "Seattle".
  const placeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');

  // URLSearchParams safely builds the ?name=Seattle&count=1... part.
  placeUrl.search = new URLSearchParams({
    name: city,
    count: '1',
    language: 'en',
    format: 'json',
  });

  // fetchJson is a small helper function near the bottom of this file.
  const placeData = await fetchJson(placeUrl);

  // ?. means "only keep going if results exists".
  // [0] means "use the first search result".
  const place = placeData.results?.[0];
  if (!place) return `I could not find live weather for "${city}".`;

  // Step 2: ask Open-Meteo for the current weather at that location.
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

  // Return a simple string. Tool outputs are usually easiest when they are
  // short and clear, because the model will read this result next.
  return [
    `${place.name}, ${place.country}`,
    `${Math.round(current.temperature_2m)} F`,
    `feels like ${Math.round(current.apparent_temperature)} F`,
    weatherCodeToText(current.weather_code),
    `${Math.round(current.wind_speed_10m)} mph wind`,
  ].join(' | ');
}

export function calculate({ expression }) {
  // The model might call calculate({ expression: "19 * 7" }).
  // This function receives that expression and computes the answer.

  // This whitelist keeps the demo calculator limited to simple arithmetic.
  // For a real app, use a math parser library instead of Function().
  if (!/^[\d\s+\-*/().%]+$/.test(expression)) return 'Only basic arithmetic is allowed.';

  // Function(...) evaluates the math expression.
  // This is intentionally tiny for a practice project.
  return Function(`"use strict"; return (${expression})`)();
}

export function search_notes({ query }) {
  // The model might call search_notes({ query: "debugging" }).
  // We search our hardcoded notes object and return matching entries.

  // Search both note titles and note bodies.
  const q = query.toLowerCase();

  // Object.entries(notes) turns:
  //   { debugging: "Print tool calls..." }
  // into:
  //   [["debugging", "Print tool calls..."]]
  return Object.entries(notes).filter(([title, body]) => `${title} ${body}`.toLowerCase().includes(q));
}

async function fetchJson(url) {
  // fetch makes an HTTP request.
  const response = await fetch(url);

  // If the API returns an error, stop and show a useful message.
  if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`);

  // Convert the response body from JSON text into a JavaScript object.
  return response.json();
}

function weatherCodeToText(code) {
  // Open-Meteo returns numeric weather codes.
  // This helper turns common codes into beginner-friendly words.
  if (code === 0) return 'clear sky';
  if ([1, 2, 3].includes(code)) return 'partly cloudy';
  if ([45, 48].includes(code)) return 'foggy';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunderstorm';
  return `weather code ${code}`;
}

// This object connects model-requested tool names to local JavaScript functions.
// Example:
// If the model asks for "calculate", we run calculate(...).
const functions = { get_weather, calculate, search_notes };

// One user turn can take two model calls:
// 1. Stream the model until it either answers or asks for tools.
// 2. If tools were requested, run them locally and stream the model's final answer.
export async function ask(question, previous_response_id) {
  // Send the user's question to the model.
  // previous_response_id lets the API remember the earlier conversation.
  let response = await streamResponse({
    previous_response_id,
    input: question,
  });

  // Sometimes the model's first response is not final text.
  // It may say, "I need to call calculate" or "I need to call get_weather".
  // This loop handles up to 5 rounds of tool calls, which is plenty here.
  for (let i = 0; i < 5; i += 1) {
    // The Responses API returns many output items.
    // Here we keep only the items that are tool/function calls.
    const calls = response.output.filter((item) => item.type === 'function_call');

    // If there are no tool calls, the model already answered.
    // Return response.id so the CLI can continue the conversation next time.
    if (calls.length === 0) return response.id;

    // For every tool call the model requested:
    // 1. Read its JSON arguments.
    // 2. Run the matching local JavaScript function.
    // 3. Build a function_call_output message for the model.
    const input = calls.map((call) => {
      const args = JSON.parse(call.arguments);
      return runTool(call, args);
    });

    // Send the tool result(s) back to the model.
    // Now the model can use those facts to write the final answer.
    response = await streamResponse({
      previous_response_id: response.id,
      input: await Promise.all(input),
    });
  }

  throw new Error('Too many tool-calling rounds.');
}

async function runTool(call, args) {
  // The model chose a tool. Now our code actually runs it.
  const tool = functions[call.name];

  // If the tool exists, run it. If not, return an error-like string.
  // await works for both async tools like weather and sync tools like math.
  const result = tool ? await tool(args) : `Unknown tool: ${call.name}`;

  // Print the tool result so you can watch the flow in the terminal.
  console.log(`\ntool  -> ${call.name}(${JSON.stringify(args)}) = ${JSON.stringify(result)}\n`);

  // This is the exact shape the Responses API expects for tool results.
  // call_id connects this output to the model's original tool request.
  return {
    type: 'function_call_output',
    call_id: call.call_id,
    output: JSON.stringify(result),
  };
}

async function streamResponse({ previous_response_id, input }) {
  // Create the OpenAI client. It reads OPENAI_API_KEY from your environment.
  const client = new OpenAI();

  // While streaming, we remember which output item id belongs to which tool.
  // That lets us print "model -> calculate(...)" nicely.
  const callNames = new Map();

  // The Responses API stream lets us print text as it arrives.
  // If the model asks for a tool, we print the tool call too.
  const stream = client.responses.stream({
    model,
    previous_response_id,
    input,
    tools,
    instructions: 'Be brief. Use tools when useful.',
  });

  // A stream sends many small events instead of one big response.
  // This for-await loop reads each event as it arrives.
  for await (const event of stream) {
    // When a new function call starts, remember its tool name.
    if (event.type === 'response.output_item.added' && event.item.type === 'function_call') {
      callNames.set(event.item.id, event.item.name);
    }

    // When normal assistant text arrives, print it immediately.
    if (event.type === 'response.output_text.delta') process.stdout.write(event.delta);

    // When the model finishes choosing tool arguments, print the call.
    // Example: model -> calculate({"expression":"19*7"})
    if (event.type === 'response.function_call_arguments.done') {
      console.log(`\nmodel -> ${callNames.get(event.item_id) || event.name}(${event.arguments})`);
    }
  }

  // Add a clean line break after streaming finishes.
  console.log();

  // finalResponse() gives us the complete response object after streaming.
  // We need it to find tool calls and the response id.
  return stream.finalResponse();
}
