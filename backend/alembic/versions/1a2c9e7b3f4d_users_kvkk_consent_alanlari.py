"""users kvkk consent alanlari

Revision ID: 1a2c9e7b3f4d
Revises: d3f7a1c9b204
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '1a2c9e7b3f4d'
down_revision: Union[str, Sequence[str], None] = 'd3f7a1c9b204'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# KVKK açık rıza kaydı (bkz. app/models/user.py'deki aynı not) - register
# artık genel KVKK rızası + sağlık verisi özel rızasını AYRI checkbox/AYRI
# zaman damgası olarak zorunlu tutuyor. Mevcut kullanıcılarda üçü de NULL
# kalır (geriye dönük veri kaybı yok, sadece bu alanlar eklenmeden önce
# kayıt olmuş kullanıcılar için "rıza kaydı yok" anlamına gelir).


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('kvkk_consent_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('health_data_consent_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('consent_version', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('consent_version')
        batch_op.drop_column('health_data_consent_at')
        batch_op.drop_column('kvkk_consent_at')
