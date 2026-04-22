# Tool Assistant Practice

A tiny beginner-friendly tool-calling assistant with three tools:

- `get_weather(city)` gets live weather from Open-Meteo.
- `calculate(expression)` solves basic arithmetic.
- `search_notes(query)` searches a hardcoded notes object.

The terminal output shows what the model chose and what the local tool returned.

## Public Web App

Open the public webpage:

https://nathancox3.github.io/tool-assistant-practice/

The web version runs in the browser, so it does not expose an OpenAI API key.
It demonstrates the same tool flow with live weather, calculator, and notes.

## Setup

```bash
npm install
cp .env.example .env
```

Then put your OpenAI API key in `.env`.

## Run

On Windows, you can double-click:

```text
Run Tool Assistant.bat
```

Interactive mode:

```bash
npm run tool-assistant
```

One question:

```bash
npm run tool-assistant -- "What is 19 * 7?"
npm run tool-assistant -- "What's the weather in Seattle?"
npm run tool-assistant -- "Search notes for debugging"
```

## Test

```bash
npm test
```
