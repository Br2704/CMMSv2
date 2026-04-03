import 'reflect-metadata';
import path from 'path';
import { DataSource } from 'typeorm';
import { dbConfig } from '../config/db';
import { ALL_ENTITIES } from './entities/all-entities';
import { NotificationSubscriber } from '../modules/notifications/notification.subscriber';

export const AppDataSource = new DataSource({
  ...dbConfig,
  entities: ALL_ENTITIES,
  subscribers: [NotificationSubscriber],
  migrations: [path.join(__dirname, 'migrations/*.{ts,js}')],
});
