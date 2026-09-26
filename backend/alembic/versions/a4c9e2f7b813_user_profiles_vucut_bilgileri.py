"""user_profiles vucut bilgileri (boy, dogum yili, cinsiyet)

Revision ID: a4c9e2f7b813
Revises: e5a2c8d1f7b6
Create Date: 2026-09-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a4c9e2f7b813'
down_revision: Union[str, Sequence[str], None] = 'e5a2c8d1f7b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Kalori/makro hedefi önerisi (2026-09-26): hepsi isteğe bağlı, mevcut
# kullanıcılar için boş başlar.


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('user_profiles') as batch_op:
        batch_op.add_column(sa.Column('height_cm', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('birth_year', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('sex', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('user_profiles') as batch_op:
        batch_op.drop_column('sex')
        batch_op.drop_column('birth_year')
        batch_op.drop_column('height_cm')
