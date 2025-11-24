// src/App.js
import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { contractAbi, contractAddress } from "./Constant/constant";
import Login from "./Components/Login";
import Finished from "./Components/Finished";
import Connected from "./Components/Connected";
import "./App.css";

function App() {
  const [provider, setProvider] = useState(null); // ethers provider (Web3Provider)
  const [account, setAccount] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [votingStatus, setVotingStatus] = useState(true);
  const [remainingTime, setRemainingTime] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [number, setNumber] = useState("");
  const [canVote, setCanVote] = useState(true);

  // Initialize a read-only provider and read contract data (no popup)
  useEffect(() => {
    if (window.ethereum) {
      const readProvider = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(readProvider);

      // initial reads using provider (no signer) to avoid popup
      read_getCandidates(readProvider);
      read_getRemainingTime(readProvider);
      read_getCurrentStatus(readProvider);

      // Attach listeners for accounts and chain changes
      window.ethereum.on("accountsChanged", onAccountsChanged);
      window.ethereum.on("chainChanged", onChainChanged);

      return () => {
        try {
          window.ethereum.removeListener("accountsChanged", onAccountsChanged);
          window.ethereum.removeListener("chainChanged", onChainChanged);
        } catch (e) {
          // ignore if provider isn't available during cleanup
        }
      };
    }
  }, []); // run once

  // --- Account / Chain handlers ---
  async function onAccountsChanged(accounts) {
    console.log("onAccountsChanged:", accounts);
    if (accounts && accounts.length > 0) {
      // recreate provider & signer
      const p = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(p);
      const signer = p.getSigner();
      try {
        const address = await signer.getAddress();
        setAccount(address);
        setIsConnected(true);

        // refresh reads
        await read_getCandidates(p);
        await read_getRemainingTime(p);
        await read_getCurrentStatus(p);
        await updateCanVote(signer);
      } catch (err) {
        console.error("onAccountsChanged error:", err);
      }
    } else {
      setIsConnected(false);
      setAccount(null);
      setCanVote(true);
    }
  }

  async function onChainChanged(chainId) {
    console.log("onChainChanged:", chainId);
    // recreate provider and refresh state
    const p = new ethers.providers.Web3Provider(window.ethereum);
    setProvider(p);
    try {
      await read_getCandidates(p);
      await read_getRemainingTime(p);
      await read_getCurrentStatus(p);
      // refresh voter's status if connected
      try {
        const signer = p.getSigner();
        await updateCanVote(signer);
      } catch (e) {
        // no signer available yet
      }
    } catch (err) {
      console.error("onChainChanged read error:", err);
    }
  }

  // --- Voting / contract interactions ---

  // send transaction (requires signer)
  async function vote() {
    const p = provider ?? new ethers.providers.Web3Provider(window.ethereum);
    const signer = p.getSigner();
    const contractInstance = new ethers.Contract(contractAddress, contractAbi, signer);
    const candidateIndex = parseInt(number, 10);
    if (Number.isNaN(candidateIndex)) return alert("Please enter a valid candidate index");
    try {
      const tx = await contractInstance.vote(candidateIndex);
      await tx.wait();
      // refresh local state after vote
      await read_getCandidates(p);
      await updateCanVote(signer);
    } catch (err) {
      console.error("Vote failed:", err);
      // show short feedback
      if (err?.error?.message) {
        alert(err.error.message);
      } else if (err?.reason) {
        alert(err.reason);
      } else {
        // generic
        alert("Vote failed; see console for details.");
      }
    }
  }

  // checks if connected address has voted — uses signer
  async function updateCanVote(signer) {
    try {
      const contractInstance = new ethers.Contract(contractAddress, contractAbi, signer);
      const addr = await signer.getAddress();
      const voteStatus = await contractInstance.voters(addr); // true = already voted
      setCanVote(!voteStatus);
    } catch (err) {
      console.error("updateCanVote error:", err);
      // if signer not available, default allow
      setCanVote(true);
    }
  }

  // read-only: get candidates (use provider, no signer, no popup)
  async function read_getCandidates(p) {
    try {
      console.log("read_getCandidates: provider ready?", !!p);
      if (!p) return;
      const network = await p.getNetwork();
      console.log("Provider network:", network);
      console.log("Using contract address:", contractAddress);

      const contractInstance = new ethers.Contract(contractAddress, contractAbi, p);
      const candidatesList = await contractInstance.getAllVotesOfCandiates();
      console.log("Raw candidatesList from contract:", candidatesList);

      const formattedCandidates = candidatesList.map((candidate, index) => {
        console.log("candidate raw item:", candidate);
        const name = candidate.name ?? candidate[0];
        const voteCountBn = candidate.voteCount ?? candidate[1];
        const voteCount = voteCountBn && voteCountBn.toNumber ? voteCountBn.toNumber() : Number(voteCountBn);
        return { index, name, voteCount };
      });

      console.log("formattedCandidates:", formattedCandidates);
      setCandidates(formattedCandidates);
    } catch (err) {
      console.error("read_getCandidates error:", err);
    }
  }

  async function read_getCurrentStatus(p) {
    try {
      if (!p) return;
      const contractInstance = new ethers.Contract(contractAddress, contractAbi, p);
      const status = await contractInstance.getVotingStatus();
      setVotingStatus(status);
    } catch (err) {
      console.error("read_getCurrentStatus error:", err);
    }
  }

  async function read_getRemainingTime(p) {
    try {
      if (!p) return;
      const contractInstance = new ethers.Contract(contractAddress, contractAbi, p);
      const time = await contractInstance.getRemainingTime();
      setRemainingTime(time.toNumber ? time.toNumber() : Number(time));
    } catch (err) {
      console.error("read_getRemainingTime error:", err);
    }
  }

  // wallet connect flow (signer required)
  async function connectToMetamask() {
    if (!window.ethereum) {
      console.error("Metamask is not detected in the browser");
      return;
    }
    try {
      const p = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(p);
      // request accounts
      const accounts = await p.send("eth_requestAccounts", []);
      const signer = p.getSigner();
      const address = await signer.getAddress();
      setAccount(address);
      setIsConnected(true);

      // fetch signer-based pieces
      await read_getCandidates(p);
      await read_getRemainingTime(p);
      await read_getCurrentStatus(p);
      await updateCanVote(signer);
    } catch (err) {
      console.error("connectToMetamask error:", err);
    }
  }

  function handleNumberChange(e) {
    setNumber(e.target.value);
  }

  // simple UI render logic
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
