// Storage wrappers. Photos go to the document directory via expo-file-system;
// everything else uses AsyncStorage (used by Zustand persist middleware).

import { File, Paths } from "expo-file-system";

function extensionForUri(uri: string): string {
  const match = uri.match(/\.(jpg|jpeg|png|heic|webp)$/i);
  return match ? match[0].toLowerCase() : ".jpg";
}

export async function savePhotoToAppStorage(sourceUri: string): Promise<string> {
  const dir = Paths.document;
  const ext = extensionForUri(sourceUri);
  const dest = new File(dir, `profile-photo${ext}`);
  if (dest.exists) {
    dest.delete();
  }
  const source = new File(sourceUri);
  source.copy(dest);
  return dest.uri;
}

export async function deletePhotoFromAppStorage(uri: string): Promise<void> {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // best-effort
  }
}
