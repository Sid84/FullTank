import fs from 'fs';
import path from 'path';

const DATA_PATH = path.join(process.cwd(), 'src', 'data');
const STORE_FILE = path.join(DATA_PATH, 'store.json');

function ensure() {
  if (!fs.existsSync(DATA_PATH)) fs.mkdirSync(DATA_PATH, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    const seed = { stations: [], updates: [], alerts: [], users: [], history: [] };
    fs.writeFileSync(STORE_FILE, JSON.stringify(seed, null, 2));
  }
}

export function readStore() {
  ensure();
  return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
}

let writing = false;
let pending = false;
export function writeStore(next) {
  ensure();
  const json = JSON.stringify(next, null, 2);
  const doWrite = () => {
    writing = true;
    fs.writeFile(STORE_FILE, json, (err) => {
      writing = false;
      if (pending) { pending = false; doWrite(); }
      if (err) console.error('store write error', err);
    });
  };
  if (writing) pending = true; else doWrite();
}
