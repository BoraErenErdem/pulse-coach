"""users timezone

Revision ID: c7e2a9d4f1b3
Revises: a4d1f7c3b9e2
Create Date: 2026-09-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c7e2a9d4f1b3'
down_revision: Union[str, Sequence[str], None] = 'a4d1f7c3b9e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Kullanıcının cihaz saat dilimi (IANA adı, bkz. app/services/user_time.py).
# NULLABLE - NULL kalan kullanıcılarda "bugün" eskisi gibi UTC hesaplanır.


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('timezone', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('timezone')
