describe('cypress-hardhat', () => {
  beforeEach(() => {
    // Reset hardhat between tests to ensure isolation.
    // This resets the fork, as well as options like automine.
    cy.hardhat().then((hardhat) => hardhat.reset())
  })

  it('loads', () => {
    cy.visit('https://example.com')
  })

  it('exposes window.ethereum', () => {
    cy.visit('https://example.com')
    cy.window()
      .then((window) => window.ethereum.send('eth_chainId'))
      .should('equal', '0x1')
    cy.window()
      .then((window) => window.ethereum.send('eth_blockNumber'))
      .then((blockNumber) => expect(Number.isInteger(blockNumber)).to.be.true)
  })

  it('mines', () => {
    cy.visit('https://example.com')
      .then(async (window) => Number(await window.ethereum.send('eth_blockNumber')))
      .then((initialBlockNumber) => {
        cy.hardhat().then((hardhat) => hardhat.mine())
        cy.window()
          .then(async (window) => Number(await window.ethereum.send('eth_blockNumber')))
          .should('equal', initialBlockNumber + 1)
      })
  })

  it('gets accounts', () => {
    cy.visit('https://example.com')
      .then((window) => window.ethereum.send('eth_accounts'))
      .should('be.instanceOf', Array)
  })

  it('switches chains', () => {
    cy.visit('https://example.com')
      .then((window) => window.ethereum.send('eth_chainId'))
      .should('equal', '0x1')

    // Switches to the another chain
    cy.window()
      .then((window) => window.ethereum.send('wallet_switchEthereumChain', [{ chainId: '0x89' }]))
      .window()
      .then((window) => window.ethereum.send('eth_chainId'))
      .should('equal', '0x89')

    // Switches back to the default chain
    cy.hardhat().then((hardhat) => hardhat.reset())
    cy.window()
      .then((window) => window.ethereum.send('eth_chainId'))
      .should('equal', '0x1')
  })
})
