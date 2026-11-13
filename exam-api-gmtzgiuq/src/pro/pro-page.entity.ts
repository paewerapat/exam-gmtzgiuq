import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** The only row of pro_page. */
export const PRO_PAGE_ID = 1;

/** Page-level text of the Upgrade page (task 17), a single row id = 1. */
@Entity('pro_page')
export class ProPage {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 150, default: '' })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subtitle: string | null;

  // Heading of the venue picker ("เลือกสนามที่จะสมัคร")
  @Column({ type: 'varchar', length: 150, nullable: true })
  venuePickerTitle: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  footerNote: string | null;

  // VAT 7% added on top of the plan price for new payments (task 18)
  @Column({ type: 'boolean', default: false })
  vatEnabled: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
