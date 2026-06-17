import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../../infra/database/prisma.service'
import * as bcrypt from 'bcryptjs'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string, storeId: string) {
    if (!storeId) {
      throw new UnauthorizedException(
        'Loja não identificada. Verifique o domínio/subdomínio de acesso.',
      )
    }

    const user = await this.prisma.user.findUnique({
      where: { storeId_email: { storeId, email } },
    })

    if (!user || !user.active) {
      throw new UnauthorizedException('Credenciais inválidas')
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      throw new UnauthorizedException('Credenciais inválidas')
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
    }

    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    }
  }

  async register(data: {
    name: string
    email: string
    password: string
    storeId: string
  }) {
    const hashed = await bcrypt.hash(data.password, 10)

    const user = await this.prisma.user.create({
      data: {
        ...data,
        password: hashed,
        role: 'ADMIN',
      },
    })

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    }
  }
}
