"""users push token kaldır (sunucu push'u yerine cihazda yerel bildirim)

Revision ID: b7d4e1a9c362
Revises: a4c9e2f7b813
Create Date: 2026-10-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b7d4e1a9c362'
down_revision: Union[str, Sequence[str], None] = 'a4c9e2f7b813'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 2026-10-05 (KVKK): bildirimler artık cihazda yerel olarak zamanlanıyor, sunucu
# Expo'ya (ABD) push göndermiyor. Toplanmış token'lar amacı kalmayan kişisel veri -
# saklanmaz, kolonla birlikte silinir. downgrade kolonu boş olarak geri getirir.


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('expo_push_token')


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('expo_push_token', sa.String(), nullable=True))
