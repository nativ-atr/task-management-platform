import { AppDataSource } from '../infrastructure/data-source.js';

await AppDataSource.initialize();
await AppDataSource.runMigrations();
await AppDataSource.destroy();
console.log('Migrations applied.');
