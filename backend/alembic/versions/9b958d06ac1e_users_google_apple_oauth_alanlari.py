"""users google apple oauth alanlari

Revision ID: 9b958d06ac1e
Revises: f0b6d22042d0
Create Date: 2026-09-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '9b958d06ac1e'
down_revision: Union[str, Sequence[str], None] = 'f0b6d22042d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Google/Apple ile giriş (bkz. app/models/user.py'deki aynı not) - iki yeni
# sütun (sağlayıcının değişmez "sub" kimliği, e-posta değil çünkü e-posta
# sağlayıcı tarafında değişebilir) + hashed_password artık NULLABLE (OAuth-
# only hesaplarda şifre hiç yok). Mevcut (parola ile kayıtlı) kullanıcılarda
# üç alan da etkilenmiyor - google_sub/apple_sub NULL kalır, hashed_password
# dolu kalır.


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column('hashed_password', existing_type=sa.String(), nullable=True)
        batch_op.add_column(sa.Column('google_sub', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('apple_sub', sa.String(), nullable=True))
        batch_op.create_unique_constraint('uq_users_google_sub', ['google_sub'])
        batch_op.create_unique_constraint('uq_users_apple_sub', ['apple_sub'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_constraint('uq_users_apple_sub', type_='unique')
        batch_op.drop_constraint('uq_users_google_sub', type_='unique')
        batch_op.drop_column('apple_sub')
        batch_op.drop_column('google_sub')
        batch_op.alter_column('hashed_password', existing_type=sa.String(), nullable=False)
