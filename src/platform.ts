import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

let connection: SQLite.SQLiteDatabase | undefined;
function db() {
  if (!connection) {
    connection = SQLite.openDatabaseSync('form.db');
    connection.execSync('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, data TEXT NOT NULL);');
  }
  return connection;
}
export async function readSnapshot(previous = false): Promise<string | null> {
  return db().getFirstSync<{ payload: string }>('SELECT payload FROM snapshots WHERE id = ?', previous ? 'previous' : 'current')?.payload ?? null;
}
export async function writeSnapshot(payload: string): Promise<void> {
  db().withTransactionSync(() => {
    db().runSync("INSERT OR REPLACE INTO snapshots (id, payload) SELECT 'previous', payload FROM snapshots WHERE id = 'current'");
    db().runSync("INSERT OR REPLACE INTO snapshots (id, payload) VALUES ('current', ?)", payload);
  });
}
export async function saveImage(id: string, data: string) {
  db().runSync('INSERT OR REPLACE INTO images (id, data) VALUES (?, ?)', id, data);
}
export async function imageData(id: string): Promise<string | undefined> {
  return db().getFirstSync<{ data: string }>('SELECT data FROM images WHERE id = ?', id)?.data;
}
export const getSecret = (key: string) => SecureStore.getItemAsync(key);
export const setSecret = (key: string, value: string) => value ? SecureStore.setItemAsync(key, value) : SecureStore.deleteItemAsync(key);
export async function chooseTextFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', 'text/csv'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const file = result.assets[0]!;
  if ((file.size ?? 0) > 60 * 1024 * 1024) throw new Error('Choose a file smaller than 60 MB.');
  try { return await FileSystem.readAsStringAsync(file.uri); }
  finally { await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => undefined); }
}
export async function exportText(text: string, filename: string) {
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is not available on this device.');
  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, text);
  try { await Sharing.shareAsync(path, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save your FORM backup' }); }
  finally { await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined); }
}
