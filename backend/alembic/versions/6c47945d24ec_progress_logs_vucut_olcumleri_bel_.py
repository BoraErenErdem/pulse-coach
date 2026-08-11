"""progress_logs vucut olcumleri (bel cevresi, yag orani)

Revision ID: 6c47945d24ec
Revises: 2051c30c07f7
Create Date: 2026-08-11 16:14:51.125564

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '6c47945d24ec'
down_revision: Union[str, Sequence[str], None] = '2051c30c07f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# NOT: autogenerate ayrıca food_catalog/meal_entries'te REAL->Float tip
# kozmetiği (SQLite'ta aynı affinity, gerçek bir fark değil) ve
# progress_logs.measurements_json (modelde hiç yok, eski bir baseline
# kalıntısı, önceki migration 2051c30c07f7'de de AYNI gerekçeyle kapsam
# dışı bırakılmıştı) için de değişiklik önermişti - elle çıkarıldı.


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('progress_logs') as batch_op:
        batch_op.add_column(sa.Column('waist_cm', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('body_fat_pct', sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('progress_logs') as batch_op:
        batch_op.drop_column('body_fat_pct')
        batch_op.drop_column('waist_cm')
