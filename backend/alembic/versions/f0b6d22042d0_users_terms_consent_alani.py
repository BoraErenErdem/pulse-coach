"""users terms consent alani

Revision ID: f0b6d22042d0
Revises: 1a2c9e7b3f4d
Create Date: 2026-09-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f0b6d22042d0'
down_revision: Union[str, Sequence[str], None] = '1a2c9e7b3f4d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Kullanım Koşulları açık kabulü (bkz. app/models/user.py'deki aynı not) -
# register artık KVKK'daki iki rızanın (genel + sağlık verisi) yanı sıra
# Kullanım Koşulları'nı (özellikle tıbbi sorumluluk reddi maddesi) da AYRI
# bir zorunlu checkbox/zaman damgası olarak istiyor - AI koçun tıbbi tavsiye
# yerine geçmediğine kullanıcının AÇIKÇA onay verdiğinin kanıtı, sadece
# sayfada bir cümle olmaktan daha güçlü. Mevcut kullanıcılarda NULL kalır
# (geriye dönük zorla re-consent akışı YOK, tıpkı kvkk_consent_at gibi).


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('terms_consent_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('terms_consent_at')
