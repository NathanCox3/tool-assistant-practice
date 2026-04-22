#!/usr/bin/env node

// This file is the command-line interface.
// It lets you run the assistant from your terminal with:
//   npm run tool-assistant
// or with one question:
//   npm run tool-assistant -- "What is 19 * 7?"

// readline lets Node ask questions in the terminal.
import readline from 'node:readline/promises';

// stdin is keyboard input. stdout is terminal output.
import { stdin, stdout } from 'node:process';

// ask() is the main assistant function from assistant.mjs.
import { ask } from './assistant.mjs';

// The OpenAI SDK needs an API key.
// package.json runs this file with --env-file-if-exists=.env,
// so OPENAI_API_KEY can live in your .env file.
if (!process.env.OPENAI_API_KEY) {
  console.error('Set OPENAI_API_KEY in .env first.');
  process.exit(1);
}

// This remembers the previous model response.
// It lets follow-up questions work in the same conversation.
let previousResponseId;

// Anything typed after "--" becomes a one-time question.
// Example:
//   npm run tool-assistant -- "weather in Seattle"
const oneShot = process.argv.slice(2).join(' ');

// If the user gave a one-time question, answer it and exit.
if (oneShot) {
  await ask(oneShot);
  process.exit(0);
}

// If there was no one-time question, start interactive mode.
const rl = readline.createInterface({ input: stdin, output: stdout });

console.log('Ask about weather, math, or notes. Type "exit" to quit.');
console.log('Try: weather in Seattle, 19 * 7, notes about debugging\n');

// Keep asking for questions until the user presses Enter on a blank line
// or types "exit".
while (true) {
  const question = (await rl.question('you   -> ')).trim();
  if (!question || question === 'exit') break;

  // Send the question to the assistant.
  // Save the returned response id for conversational memory.
  previousResponseId = await ask(question, previousResponseId);
}

// Close the terminal prompt cleanly.
rl.close();
