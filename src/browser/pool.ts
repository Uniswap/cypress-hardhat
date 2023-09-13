import { JsonRpcProvider } from '@ethersproject/providers'
import { Token, V3_CORE_FACTORY_ADDRESSES } from '@uniswap/sdk-core'
import { UniswapV3__factory } from '../types'
import { BigNumber } from 'ethers/lib/ethers'
import { computePoolAddress } from '@uniswap/v3-sdk'

interface PoolInfo {
  token0: string
  token1: string
  fee: number
  tickSpacing: number
  sqrtPriceX96: BigNumber
  liquidity: BigNumber
  tick: number
}

export class PoolUtils {
  constructor(readonly provider: JsonRpcProvider) {}

  /** Returns the address of the Universal Router for the current chain */
  async getPoolFactoryContractAddress() {
    const network = await this.provider.getNetwork()
    return V3_CORE_FACTORY_ADDRESSES[network.chainId]
  }
  
  async getPoolInfo(token0: Token, token1: Token, fee: number) {
    const uniswapV3 = UniswapV3__factory.connect((await this.getPoolFactoryContractAddress()), this.provider)
    const pool = await uniswapV3.getPool(token0.address, token1.address, fee)
    return pool
    console.log(pool)
    // console.log(pool)
  
    // const [token0, token1, fee, tickSpacing, liquidity, slot0] =
    //   await Promise.all([
    //     uniswapV3Factory.token0(),
    //     uniswapV3Factory.token1(),
    //     poolContract.fee(),
    //     poolContract.tickSpacing(),
    //     poolContract.liquidity(),
    //     poolContract.slot0(),
    //   ])
  
    // return {
    //   token0,
    //   token1,
    //   fee,
    //   tickSpacing,
    //   liquidity,
    //   sqrtPriceX96: slot0[0],
    //   tick: slot0[1],
    // }
  }
}