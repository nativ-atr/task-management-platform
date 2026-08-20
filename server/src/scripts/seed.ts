import { AppDataSource } from '../infrastructure/data-source.js';
import { UserEntity, type UserRow } from '../infrastructure/entities.js';

const users: UserRow[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Avery Procurement',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Blake Development',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    displayName: 'Casey Reviewer',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

await AppDataSource.initialize();
await AppDataSource.createQueryBuilder()
  .insert()
  .into(UserEntity)
  .values(users)
  .orUpdate(['display_name', 'updated_at'], ['id'])
  .execute();
await AppDataSource.destroy();
console.log('Demo users seeded.');
