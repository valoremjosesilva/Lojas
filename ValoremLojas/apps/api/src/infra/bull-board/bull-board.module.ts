import { Module } from '@nestjs/common'
import { BullModule, getQueueToken } from '@nestjs/bull'
import { Queue } from 'bull'
import { createBullBoard } from '@bull-board/api'
import { BullAdapter } from '@bull-board/api/bullAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { QUEUE_EMAIL, QUEUE_SEARCH } from '../../modules/jobs/jobs.constants'

/**
 * Token do router do Bull Board — recuperado em main.ts e montado em /bull-board.
 */
export const BULL_BOARD_ROUTER = 'BULL_BOARD_ROUTER'

/**
 * Registra o Bull Board (UI de debug das filas) com as filas `email` e
 * `search-index`. Expõe o router do Express como provider para ser montado
 * manualmente no bootstrap (main.ts).
 *
 * Autenticação: nenhuma por ora — proteger via proxy/infra no deploy.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_EMAIL }, { name: QUEUE_SEARCH }),
  ],
  providers: [
    {
      provide: BULL_BOARD_ROUTER,
      inject: [getQueueToken(QUEUE_EMAIL), getQueueToken(QUEUE_SEARCH)],
      useFactory: (emailQueue: Queue, searchQueue: Queue) => {
        const serverAdapter = new ExpressAdapter()
        serverAdapter.setBasePath('/bull-board')

        createBullBoard({
          queues: [new BullAdapter(emailQueue), new BullAdapter(searchQueue)],
          serverAdapter,
        })

        return serverAdapter.getRouter()
      },
    },
  ],
  exports: [BULL_BOARD_ROUTER],
})
export class BullBoardModule {}
