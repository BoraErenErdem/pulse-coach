"""user_profiles: preferred_language alani

Revision ID: 2051c30c07f7
Revises: 9232ba225e46
Create Date: 2026-08-08 17:18:19.047549

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '2051c30c07f7'
down_revision: Union[str, Sequence[str], None] = '9232ba225e46'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# NOT: autogenerate ayrıca food_catalog/meal_entries'te REAL->Float tip
# kozmetiği (SQLite'ta ayni affinity, gerçek bir fark değil) ve
# progress_logs.measurements_json (modelde hiç yok, eski bir baseline
# kalıntısı) için de değişiklik önermişti - önceki migration'daki (bkz.
# 9232ba225e46) AYNI gerekçeyle bu migration'ın kapsamı DIŞINDA olduğu
# için elle çıkarıldı.


def upgrade() -> None:
    """Upgrade schema."""
    # server_default ZORUNLU: mevcut satırlar (prod'da 120+ kullanıcı) için
    # NOT NULL bir kolon backfill edilmeden eklenemez (SQLite ALTER TABLE
    # kısıtı). Uygulama tarafında model default'u ("tr") zaten var, bu
    # sadece DB seviyesinde aynı değeri garanti ediyor.
    with op.batch_alter_table('user_profiles') as batch_op:
        batch_op.add_column(
            sa.Column('preferred_language', sa.String(), nullable=False, server_default='tr')
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('user_profiles') as batch_op:
        batch_op.drop_column('preferred_language')
