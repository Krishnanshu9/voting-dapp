// patch: App.js (key parts)
// See full file: App.js. :contentReference[oaicite:6]{index=6}

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { contractAbi, contractAddress } from './Constant/constant';
import Login from './Components/Login';
import Finished from './Components/Finished';
import Connected from './Components/Connected';
import './App.css';

function App() {
  const [provider, setProvider] = useState(null); // stored provider
  const [account, setAccount] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [votingStatus, setVotingStatus] = useState(true);
  const [remainingTime, setRemainingTime] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [number, setNumber] = useState('');
  const [canVote, setCanVote] = useState(true); // camelCase

  useEffect(() => {
    // Only call read-only functions if window.ethereum exists and we have a provider
    if (window.ethereum) {
      const readProvider = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(readProvider);
      // initial reads using provider (no signer) to avoid popup
      read_getCandidates(readProvider);
      read_getRemainingTime(readProvider);
      read_getCurrentStatus(readProvider);

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      };
    }
  }, []);

  // send transaction (requires signer)
  async function vote() {
    if (!provider) return console.error('Provider not ready');
    const signer = provider.getSigner();
    const contractInstance = new ethers.Contract(contractAddress, contractAbi, signer);
    const candidateIndex = parseInt(number, 10);
    if (Number.isNaN(candidateIndex)) return alert('Please enter a valid candidate index');
    try {
      const tx = await contractInstance.vote(candidateIndex);
      await tx.wait();
      // refresh local state after vote
      await read_getCandidates(provider);
      await updateCanVote(signer); // refresh voter's status
    } catch (err) {
      console.error('Vote failed:', err);
    }
  }

  // checks if connected address has voted — uses signer
  async function updateCanVote(signer) {
    const contractInstance = new ethers.Contract(contractAddress, contractAbi, signer);
    const addr = await signer.getAddress();
    const voteStatus = await contractInstance.voters(addr); // returns bool (true = already voted)
    setCanVote(!voteStatus);
  }

  // read-only: get candidates (use provider, no signer, no popup)
  async function read_getCandidates(p) {
    if (!p) return;
    const contractInstance = new ethers.Contract(contractAddress, contractAbi, p);
    const candidatesList = await contractInstance.getAllVotesOfCandiates();
    const formattedCandidates = candidatesList.map((candidate, index) => ({
      index,
      name: candidate.name,
      voteCount: candidate.voteCount.toNumber()
    }));
    setCandidates(formattedCandidates);
  }

  async function read_getCurrentStatus(p) {
    if (!p) return;
    const contractInstance = new ethers.Contract(contractAddress, contractAbi, p);
    const status = await contractInstance.getVotingStatus();
    setVotingStatus(status);
  }

  async function read_getRemainingTime(p) {
    if (!p) return;
    const contractInstance = new ethers.Contract(contractAddress, contractAbi, p);
    const time = await contractInstance.getRemainingTime();
    setRemainingTime(time.toNumber());
  }

  function handleAccountsChanged(accounts) {
    if (accounts && accounts.length > 0) {
      setAccount(accounts[0]);
      setIsConnected(true);
      // when accounts change, create signer from stored provider and refresh canVote + candidates
      if (provider) {
        const signer = provider.getSigner();
        updateCanVote(signer);
        read_getCandidates(provider);
      }
    } else {
      setIsConnected(false);
      setAccount(null);
      setCanVote(true);
    }
  }

  async function connectToMetamask() {
    if (window.ethereum) {
      try {
        const p = new ethers.providers.Web3Provider(window.ethereum);
        setProvider(p);
        await p.send("eth_requestAccounts", []);
        const signer = p.getSigner();
        const address = await signer.getAddress();
        setAccount(address);
        setIsConnected(true);

        // fetch signer-based pieces
        updateCanVote(signer);
        read_getCandidates(p);
        read_getRemainingTime(p);
        read_getCurrentStatus(p);
      } catch (err) {
        console.error(err);
      }
    } else {
      console.error("Metamask is not detected in the browser");
    }
  }

  function handleNumberChange(e) {
    setNumber(e.target.value);
  }

  return (
    <div className="App">
      {votingStatus ? (
        isConnected ? (
          <Connected
            account={account}
            candidates={candidates}
            remainingTime={remainingTime}
            number={number}
            handleNumberChange={handleNumberChange}
            voteFunction={vote}
            showButton={canVote}
          />
        ) : (
          <Login connectWallet={connectToMetamask} />
        )
      ) : (
        <Finished />
      )}
    </div>
  );
}

export default App;
