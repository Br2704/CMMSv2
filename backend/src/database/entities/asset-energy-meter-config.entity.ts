import { Column, Entity } from 'typeorm';
import { TimestampedUuidEntity } from './common';

export type EnergyMeterDataPoint = {
  label: string;
  register: string;
  unit: string | null;
  multiplier: number | null;
};

@Entity('asset_energy_meter_configs')
export class AssetEnergyMeterConfigEntity extends TimestampedUuidEntity {
  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @Column({ name: 'plant_id', type: 'uuid' })
  plantId!: string;

  @Column({ name: 'checklist_name', type: 'varchar', default: 'Energy Meter Checklist' })
  checklistName!: string;

  @Column({ name: 'meter_name', type: 'varchar' })
  meterName!: string;

  @Column({ name: 'connection_type', type: 'varchar', default: 'MODBUS_TCP' })
  connectionType!: 'MODBUS_TCP' | 'MODBUS_RTU_RS485';

  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'int', default: 502 })
  port!: number;

  @Column({ name: 'modbus_slave_id', type: 'int', nullable: true })
  modbusSlaveId!: number | null;

  @Column({ name: 'modbus_register', type: 'varchar', nullable: true })
  modbusRegister!: string | null;

  @Column({ name: 'baud_rate', type: 'int', nullable: true })
  baudRate!: number | null;

  @Column({ type: 'varchar', nullable: true })
  parity!: 'NONE' | 'EVEN' | 'ODD' | null;

  @Column({ name: 'stop_bits', type: 'int', nullable: true })
  stopBits!: number | null;

  @Column({ name: 'poll_interval_seconds', type: 'int', default: 60 })
  pollIntervalSeconds!: number;

  @Column({ name: 'driver_type', type: 'varchar', default: 'DOTNET_RS485_BRIDGE' })
  driverType!: 'DOTNET_RS485_BRIDGE' | 'NATIVE_MODBUS_TCP';

  @Column({ name: 'bridge_endpoint', type: 'varchar', nullable: true })
  bridgeEndpoint!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'data_points', type: 'simple-json', nullable: true })
  dataPoints!: EnergyMeterDataPoint[] | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
