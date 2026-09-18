// AEVON - Link helpers & external references

const PONS_SITE = 'https://www.ponsfamily.com';
const EXPLORER = CONTRACTS.EXPLORER;

class PonsLinks {
  getTokenUrl(tokenAddress) {
    return `${PONS_SITE}/launchpad/${tokenAddress}`;
  }
  getExplorerUrl(address) {
    return `${EXPLORER}/address/${address}`;
  }
  getExplorerTxUrl(txHash) {
    return `${EXPLORER}/tx/${txHash}`;
  }
  getGeckoUrl(tokenAddress) {
    return `https://www.geckoterminal.com/robinhood/tokens/${tokenAddress}`;
  }
}

window.ponsLinks = new PonsLinks();
