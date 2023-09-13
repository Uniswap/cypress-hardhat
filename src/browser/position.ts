import { JsonRpcProvider } from '@ethersproject/providers'
import { NONFUNGIBLE_POSITION_MANAGER_ADDRESSES } from '@uniswap/sdk-core'
import { NonfungiblePositionManager__factory } from '../types'
import { BigNumber } from 'ethers/lib/ethers'
import { Position } from '@uniswap/v3-sdk'

interface PositionInfo {
  token0: string,
  token1: string,
  tickLower: number
  tickUpper: number
  liquidity: BigNumber
  feeGrowthInside0LastX128: BigNumber
  feeGrowthInside1LastX128: BigNumber
  tokensOwed0: BigNumber
  tokensOwed1: BigNumber
}

export class PositionUtils {
  constructor(readonly provider: JsonRpcProvider) {}

  /** Returns the address of the Universal Router for the current chain */
  async getNonFungiblePositionManagerAddress() {
    const network = await this.provider.getNetwork()
    return NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[network.chainId]
  }
  
  /** Returns the tokenIds of each position held by the given address */
  async getPositionIds(address: string): Promise<number[]> {
    const nonFungiblePositionManager = NonfungiblePositionManager__factory.connect((await this.getNonFungiblePositionManagerAddress()), this.provider)
    
    // Get number of positions
    const balance = Number(await nonFungiblePositionManager.balanceOf(address))

    // Get all positions
    const tokenIds: number[] = []
    for (let i = 0; i < balance; i++) {
        const tokenOfOwnerByIndex = Number(await nonFungiblePositionManager.tokenOfOwnerByIndex(address, i))
        tokenIds.push(tokenOfOwnerByIndex)
    }
    return tokenIds
  }

  /** Returns info describing the position represented by the given tokenId */
  async getPosition(tokenId: number): Promise<Position> {
    const nonFungiblePositionManager = NonfungiblePositionManager__factory.connect((await this.getNonFungiblePositionManagerAddress()), this.provider)
    
    const position = await nonFungiblePositionManager.positions(tokenId) as Position
    
    return {
      token0: position.token0,
      token1: position.token1,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      liquidity: JSBI.BigInt(position.liquidity),
      feeGrowthInside0LastX128: position.feeGrowthInside0LastX128,
      feeGrowthInside1LastX128: position.feeGrowthInside1LastX128,
      tokensOwed0: position.tokensOwed0,
      tokensOwed1: position.tokensOwed1,
    }
  }
}