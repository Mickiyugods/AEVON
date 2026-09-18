// AEVON Token Launchpad - Bonding Curve Engine
// Implements linear, quadratic, and exponential bonding curves

class BondingCurve {
  constructor(type = 'quadratic', config = {}) {
    this.type = type;
    this.basePrice = config.basePrice || 0.000001; // Starting price in USDG
    this.totalSupply = config.totalSupply || 1_000_000_000;
    this.graduationThreshold = config.graduationThreshold || 69_000; // $69k USDG market cap
    this.sold = config.sold || 0;
    this.reserveBalance = config.reserveBalance || 0;

    // Curve-specific params
    switch (type) {
      case 'linear':
        this.slope = config.slope || 0.00000001;
        break;
      case 'quadratic':
        this.k = config.k || 0.0000000000001;
        break;
      case 'exponential':
        this.exponent = config.exponent || 1.5;
        this.k = config.k || 0.000000001;
        break;
    }
  }

  getPrice(supply = this.sold) {
    switch (this.type) {
      case 'linear':
        return this.basePrice + this.slope * supply;
      case 'quadratic':
        return this.basePrice + this.k * supply * supply;
      case 'exponential':
        return this.basePrice + this.k * Math.pow(supply, this.exponent);
      default:
        return this.basePrice;
    }
  }

  getMarketCap() {
    return this.getPrice() * this.totalSupply;
  }

  getBuyPrice(usdgAmount) {
    let remaining = usdgAmount;
    let tokensBought = 0;
    let currentSupply = this.sold;
    const step = Math.max(1, this.totalSupply / 100000);

    while (remaining > 0) {
      const price = this.getPrice(currentSupply);
      const cost = price * step;
      if (cost > remaining) {
        tokensBought += remaining / price;
        break;
      }
      remaining -= cost;
      tokensBought += step;
      currentSupply += step;
    }
    return { tokens: tokensBought, avgPrice: usdgAmount / tokensBought };
  }

  getSellPrice(tokenAmount) {
    let tokensLeft = tokenAmount;
    let usdgOut = 0;
    let currentSupply = this.sold;
    const step = Math.max(1, this.totalSupply / 100000);

    while (tokensLeft > 0 && currentSupply > 0) {
      const sellStep = Math.min(step, tokensLeft, currentSupply);
      const price = this.getPrice(currentSupply);
      usdgOut += price * sellStep;
      tokensLeft -= sellStep;
      currentSupply -= sellStep;
    }
    return { usdg: usdgOut, avgPrice: usdgOut / tokenAmount };
  }

  buy(usdgAmount) {
    const result = this.getBuyPrice(usdgAmount);
    this.sold += result.tokens;
    this.reserveBalance += usdgAmount;
    return result;
  }

  sell(tokenAmount) {
    const result = this.getSellPrice(tokenAmount);
    this.sold -= tokenAmount;
    this.reserveBalance -= result.usdg;
    return result;
  }

  isGraduated() {
    return this.getMarketCap() >= this.graduationThreshold;
  }

  getProgress() {
    return Math.min(100, (this.reserveBalance / this.graduationThreshold) * 100);
  }

  generatePriceData(points = 100) {
    const data = [];
    const maxSupply = this.totalSupply * 0.8;
    const step = maxSupply / points;
    for (let i = 0; i <= points; i++) {
      const supply = step * i;
      data.push({
        supply,
        price: this.getPrice(supply),
        marketCap: this.getPrice(supply) * this.totalSupply
      });
    }
    return data;
  }

  generateTradeHistory(currentSold) {
    const history = [];
    const steps = 50;
    const supplyStep = currentSold / steps;
    let price = this.basePrice;
    for (let i = 0; i <= steps; i++) {
      const supply = supplyStep * i;
      price = this.getPrice(supply);
      const variation = 1 + (Math.random() - 0.5) * 0.1;
      history.push({
        time: Date.now() - (steps - i) * 60000 * Math.random() * 10,
        price: price * variation,
        supply
      });
    }
    return history.sort((a, b) => a.time - b.time);
  }
}

window.BondingCurve = BondingCurve;
