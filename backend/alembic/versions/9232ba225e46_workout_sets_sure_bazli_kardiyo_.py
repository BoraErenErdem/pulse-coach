"""workout_sets: sure bazli kardiyo/esneklik alanlari + reps nullable

Revision ID: 9232ba225e46
Revises: 587cf4824055
Create Date: 2026-08-06 19:37:32.609333

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '9232ba225e46'
down_revision: Union[str, Sequence[str], None] = '587cf4824055'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# NOT: autogenerate ayrıca food_catalog/meal_entries'te REAL->Float tip
# kozmetiği (SQLite'ta ayni affinity, gerçek bir fark değil) ve
# progress_logs.measurements_json (modelde hiç yok, eski bir baseline
# kalıntısı) için de değişiklik önermişti - bu migration'ın kapsamı
# DIŞINDA olduğu için elle çıkarıldı (ayrı, ilgisiz bir schema drift'i
# bununla karıştırmamak için).


def upgrade() -> None:
    """Upgrade schema.

    SQLite ham ALTER TABLE ile kolon nullable'lığını değiştirmeyi
    desteklemiyor (sadece ADD COLUMN/DROP COLUMN destekliyor) - Alembic'in
    batch mode'u (tabloyu arka planda yeniden oluşturup veriyi kopyalıyor)
    kullanılmadan `op.alter_column(..., nullable=True)` sessizce
    başarısız/no-op kalıyordu (canlı denemede bulundu: ADD COLUMN'lar
    uygulandı ama nullable değişikliği hiç işlemedi, alembic_version de
    hiç güncellenmedi çünkü fonksiyon tamamlanmadan patladı)."""
    with op.batch_alter_table('workout_sets') as batch_op:
        batch_op.add_column(sa.Column('duration_minutes', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('intensity', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('cardio_category', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('estimated_calories', sa.Float(), nullable=True))
        batch_op.alter_column('reps', existing_type=sa.INTEGER(), nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('workout_sets') as batch_op:
        batch_op.alter_column('reps', existing_type=sa.INTEGER(), nullable=False)
        batch_op.drop_column('estimated_calories')
        batch_op.drop_column('cardio_category')
        batch_op.drop_column('intensity')
        batch_op.drop_column('duration_minutes')
