import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * The Opn (Omise) customer of a user (task 18), made at the first card
 * payment; its default card is charged by the renewal schedules. Only the
 * brand and the last 4 digits of the card are kept (shown as •••• 4242):
 * never any other card data. No FK to users (see the SQL header).
 */
@Entity('pro_customers')
@Index('UQ_pro_customers_omise', ['omiseCustomerId'], { unique: true })
export class ProCustomer {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  omiseCustomerId: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  cardBrand: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  cardLastDigits: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
