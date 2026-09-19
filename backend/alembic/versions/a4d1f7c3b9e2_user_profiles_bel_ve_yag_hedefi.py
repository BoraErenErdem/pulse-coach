"""user_profiles bel ve yag orani hedefi

Revision ID: a4d1f7c3b9e2
Revises: 9b958d06ac1e
Create Date: 2026-09-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a4d1f7c3b9e2'
down_revision: Union[str, Sequence[str], None] = '9b958d06ac1e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# İlerleme sekmesinde OPSİYONEL bel çevresi / vücut yağ oranı hedefleri (bkz.
# app/models/user_profile.py'deki aynı not). İki yeni NULLABLE sütun - mevcut
# profillerde NULL kalır (hedef yok), hiçbir mevcut veri etkilenmez.


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('user_profiles') as batch_op:
        batch_op.add_column(sa.Column('target_waist_cm', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('target_body_fat_pct', sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('user_profiles') as batch_op:
        batch_op.drop_column('target_body_fat_pct')
        batch_op.drop_column('target_waist_cm')
