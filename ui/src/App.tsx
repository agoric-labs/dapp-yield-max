import React, { useEffect } from 'react';
import './App.css';
import {
  makeAgoricChainStorageWatcher,
  AgoricChainStoragePathKind as Kind,
} from '@agoric/rpc';
import {
  makeAgoricWalletConnection,
  suggestChain,
} from '@agoric/web-components';
import { AgoricContractForm } from './components/AgoricContractForm';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';
import Logo from './components/Logo';
import gituhbLogo from '/github.svg';
import WalletStatus from './components/WalletStatus';
import { useAppStore } from './state';
import { MakeAccount } from './components/MakeAccount';
import { CurrentOffer } from './interfaces/interfaces';

const ENDPOINTS = {
  RPC: 'http://localhost/agoric-rpc',
  API: 'http://localhost/agoric-lcd',
};

const watcher = makeAgoricChainStorageWatcher(ENDPOINTS.API, 'agoriclocal');

const setup = async (walletAddress: string | undefined) => {
  watcher.watchLatest<Array<[string, unknown]>>(
    [Kind.Data, 'published.agoricNames.instance'],
    (instances) => {
      console.log('got instances', instances);
      useAppStore.setState({
        contractInstance: instances.find(([name]) => name === 'axelarGmp')?.[1],
      });
    },
  );

  const { fromEntries } = Object;

  watcher.watchLatest<Array<[string, unknown]>>(
    [Kind.Data, 'published.agoricNames.brand'],
    (brands) => {
      console.log('Got brands', brands);
      useAppStore.setState({
        brands: fromEntries(brands),
      });
    },
  );

  watcher.watchLatest<CurrentOffer>(
    [Kind.Data, `published.wallet.${walletAddress}.current`],
    (co) => {
      const currentOffer = co ? co : null;
      if (!currentOffer) {
        return;
      }
      useAppStore.setState({
        currentOffers: currentOffer,
      });
    },
  );
};

const connectWallet = async () => {
  await suggestChain('https://local.agoric.net/network-config');
  const wallet = await makeAgoricWalletConnection(watcher, ENDPOINTS.RPC);
  useAppStore.setState({ wallet });
};

function App() {
  const { wallet, loading, brands } = useAppStore((state) => ({
    wallet: state.wallet,
    loading: state.loading,
    brands: state.brands,
  }));

  useEffect(() => {
    setup(wallet?.address);
  }, [wallet]);

  return (
    <div className="container">
      <div className="view-source">
        <a href="https://github.com/agoric-labs/dapp-evm" target="_blank">
          <img src={gituhbLogo} className="github-logo" alt="Source Code" />
          Fork me on GitHub
        </a>
      </div>

      <ToastContainer
        position="bottom-right"
        hideProgressBar={false}
        newestOnTop={false}
        closeButton={false}
        closeOnClick
        autoClose={5000}
        rtl={false}
        pauseOnFocusLoss
        pauseOnHover
        theme="colored"
      />

      <Logo />

      {!wallet ? (
        <div className="connect-container">
          <button
            className="connect-button"
            onClick={connectWallet}
            disabled={loading}
          >
            {loading ? 'Connecting...' : 'Connect Wallet'}
          </button>
        </div>
      ) : (
        <div className="main-container">
          <div className="wallet-section">
            <WalletStatus address={wallet?.address} />
          </div>
          
          <div className="content-grid">
            <div className="content-card">
              <h2 className="section-title">Yield Strategies</h2>
              
              <div className="current-strategy">
                <h4>Current Strategy</h4>
                <div className="current-strategy-grid">
                  <div className="current-strategy-item">
                    <span className="current-strategy-label">Protocol</span>
                    <span className="current-strategy-value">Aave</span>
                  </div>
                  <div className="current-strategy-item">
                    <span className="current-strategy-label">Current Yield</span>
                    <span className="current-strategy-value">3.25% APY</span>
                  </div>
                </div>
                <div className="current-strategy-inputs">
                  <select className="asset-select" defaultValue="AUSDC">
                    {brands && Object.entries(brands).map(([key, brand]) => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                  <div className="asset-balance">Available: 1,234.56 USDC</div>
                  <div className="amount-input-container">
                    <input type="number" className="amount-input" placeholder="Amount" />
                    <button className="max-button">MAX</button>
                  </div>
                </div>
                <div className="current-strategy-actions">
                  <button className="current-strategy-button">Withdraw</button>
                  <button className="current-strategy-button">Claim Rewards</button>
                </div>
              </div>

              <div className="strategy-grid">
                <div className="strategy-card">
                  <h3>Aave</h3>
                  <div className="max-yield">MAX YIELD: 3.25%</div>
                </div>
                
                <div className="strategy-card">
                  <h3>Compound</h3>
                  <div className="max-yield">MAX YIELD: 2.83%</div>
                </div>
              </div>
            </div>

            <div className="content-card">
              <h2 className="section-title">Portfolio</h2>
              <div className="portfolio-stats">
                <div className="stat-item">
                  <span className="stat-label">Total Value Locked</span>
                  <span className="stat-value">$0.00</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">APY</span>
                  <span className="stat-value">0.00%</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total Rewards</span>
                  <span className="stat-value">$0.00</span>
                </div>
              </div>
            </div>
          </div>

          <MakeAccount />
        </div>
      )}
    </div>
  );
}

export default App;
