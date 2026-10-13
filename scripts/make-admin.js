import { getDatabase } from '../backend/db/database.js';
import { userRepository } from '../backend/repositories/index.js';

const username = process.argv[2];

if (!username) {
  console.error('Usage: node scripts/make-admin.js <username>');
  process.exit(1);
}

async function main() {
  try {
    const db = getDatabase();
    const cleanUsername = String(username).trim().toLowerCase();
    const user = await userRepository.findByUsername(cleanUsername);

    if (!user) {
      console.error(`Error: User "@${cleanUsername}" was not found in the database.`);
      process.exit(1);
    }

    await userRepository.updateRole(user.id, 'admin');
    console.log(`✅ Success: User @${user.username} (ID: ${user.id}) has been promoted to administrator (role: 'admin').`);
    process.exit(0);
  } catch (err) {
    console.error('Failed to promote user to administrator:', err.message);
    process.exit(1);
  }
}

main();
