#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const entryPoint = path.join(__dirname, 'src', 'index.js');

dotenv.config({ path: path.join(__dirname, '.env') });

console.log(`[run-from-cwd] using project entry: ${entryPoint}`);
console.log(`[run-from-cwd] caller working directory: ${process.cwd()}`);

await import(pathToFileURL(entryPoint).href);
