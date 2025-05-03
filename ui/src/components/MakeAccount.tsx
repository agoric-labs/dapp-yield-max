import React from 'react';
import { showError, showSuccess } from '../Utils';
import { TOAST_DURATION } from '../config';
import { useAppStore } from '../state';
import { toast } from 'react-toastify';

export const MakeAccount = () => {
  const { wallet, contractInstance, brands, currentOffers } =
    useAppStore.getState();
  const BLD = {
    brandKey: 'BLD',
    decimals: 6,
  };
  const makeOffer = async () => {
    let toastId: string | number | null = null;

    try {
      if (!contractInstance) throw new Error('No contract instance');
      if (!brands) throw new Error('Brands not initialized');
      if (!wallet) throw new Error('Wallet not connected');

      const requiredBrand = brands[BLD.brandKey];
      const amountValue = BigInt(8000);

      const give = {
        [BLD.brandKey]: {
          brand: requiredBrand,
          value: amountValue,
        },
      };

      await new Promise<void>((resolve, reject) => {
        wallet.makeOffer(
          {
            source: 'contract',
            instance: contractInstance,
            publicInvitationMaker: 'createAndMonitorLCA',
          },
          { give },
          {},
          (update: { status: string; data?: unknown }) => {
            switch (update.status) {
              case 'error':
                reject(new Error(`Offer error: ${update.data}`));
                break;
              case 'accepted':
                toast.success('Offer accepted!');
                resolve();
                break;
              case 'refunded':
                reject(new Error('Offer was rejected'));
                break;
            }
          },
        );
      });

      showSuccess({
        content: 'Transaction Submitted Successfully',
        duration: TOAST_DURATION.SUCCESS,
      });
    } catch (error) {
      showError({ content: error.message, duration: TOAST_DURATION.ERROR });
    } finally {
      if (toastId) toast.dismiss(toastId);
      useAppStore.setState({ loading: false });
    }
  };

  const handler = (action) => async () => {
    if (!latestInvitation) return;

    const requiredBrand = brands?.[BLD.brandKey];
    const amountValue = BigInt(1000000);

    const give = {
      [BLD.brandKey]: {
        brand: requiredBrand,
        value: amountValue,
      },
    };

    let targetContractAddress;
    let contractInvocationData;
    let type: Number;

    if (action === 'supply') {
      targetContractAddress = '0xd8E896691A0FCE4641D44d9E461A6d746A5c91dB';
      contractInvocationData = [
        {
          functionSignature: 'approve(address,uint256)',
          args: [
            '0x666A92418cd154380c912e3fD56fa03Fe80eE342',
            1000000000000000000000000000000000000000,
          ],
          target: '0x7cCc8E1CD3167e2bFe0a6c55d83Ed0537d3bb139',
        },
        {
          functionSignature: 'supply(address,uint256,address,uint16)',
          args: [
            '0x7cCc8E1CD3167e2bFe0a6c55d83Ed0537d3bb139',
            5,
            '0xd8E896691A0FCE4641D44d9E461A6d746A5c91dB',
            0,
          ],
          target: '0x666A92418cd154380c912e3fD56fa03Fe80eE342',
        },
      ];
      type = 2;
    } else if (action === 'withdraw') {
      targetContractAddress = '0xd8E896691A0FCE4641D44d9E461A6d746A5c91dB';
      contractInvocationData = [
        {
          functionSignature: 'withdraw(address,uint256,address)',
          args: [
            '0x7cCc8E1CD3167e2bFe0a6c55d83Ed0537d3bb139',
            5,
            '0xd8E896691A0FCE4641D44d9E461A6d746A5c91dB',
          ],
          target: '0x666A92418cd154380c912e3fD56fa03Fe80eE342',
        },
      ];
      type = 1;
    } else if (action === 'rewards') {
      targetContractAddress = '0xd8E896691A0FCE4641D44d9E461A6d746A5c91dB';
      contractInvocationData = [
        {
          functionSignature: 'claimRewards(address,address)',
          args: [
            '0x7cCc8E1CD3167e2bFe0a6c55d83Ed0537d3bb139',
            '0xd8E896691A0FCE4641D44d9E461A6d746A5c91dB',
          ],
          target: '0x666A92418cd154380c912e3fD56fa03Fe80eE342',
        },
      ];
      type = 1;
    } else if (action === 'supply-2') {
      targetContractAddress = '0xd8E896691A0FCE4641D44d9E461A6d746A5c91dB';
      contractInvocationData = [
        {
          functionSignature: 'approve(address,uint256)',
          args: [
            '0x8491D9AfC8cbDEebB9539729c05ce7924620329c',
            1000000000000000000000000000000000000000,
          ],
          target: '0x7cCc8E1CD3167e2bFe0a6c55d83Ed0537d3bb139',
        },
        {
          functionSignature: 'trackUser(address)',
          args: [
            '0xd8E896691A0FCE4641D44d9E461A6d746A5c91dB',
          ],
          target: '0x8491D9AfC8cbDEebB9539729c05ce7924620329c',
        },  
        {
          functionSignature: 'supply(address,uint256)',
          args: [
            '0x7cCc8E1CD3167e2bFe0a6c55d83Ed0537d3bb139',
            5,
          ],
          target: '0x8491D9AfC8cbDEebB9539729c05ce7924620329c',
        },
      ];
      type = 2;
    } else if (action === 'withdraw-2') {
      targetContractAddress = '0xd8E896691A0FCE4641D44d9E461A6d746A5c91dB';
      contractInvocationData = [
        {
          functionSignature: 'withdraw(address,uint256)',
          args: [
            '0x7cCc8E1CD3167e2bFe0a6c55d83Ed0537d3bb139',
            5,
          ],
          target: '0x8491D9AfC8cbDEebB9539729c05ce7924620329c',
        },
      ];
      type = 1;
    } else if (action === 'rewards-2') {
      targetContractAddress = '0xd8E896691A0FCE4641D44d9E461A6d746A5c91dB';
      contractInvocationData = [
        {
          functionSignature: 'claim(address,address,bool)',
          args: [
            '0x8491D9AfC8cbDEebB9539729c05ce7924620329c',
            '0xd8E896691A0FCE4641D44d9E461A6d746A5c91dB',
            true,
          ],
          target: '0x07a9eE6a358F26b66daeBa9Dc4482fd554418C83',
        },
      ];
      type = 1;
    }

    const args = {
      id: Date.now(),
      invitationSpec: {
        source: 'continuing',
        previousOffer: latestInvitation[0],
        invitationMakerName: 'makeEVMTransactionInvitation',
        invitationArgs: harden([
          'sendGmp',
          [
            {
              destinationAddress: targetContractAddress,
              type,
              gasAmount: 20000,
              destinationEVMChain: 'Ethereum',
              contractInvocationData,
            },
          ],
        ]),
      },
      offerArgs: {},
      proposal: { give },
    };
    let toastId: string | number | null = null;

    try {
      if (!wallet) throw new Error('Wallet not connected');

      await new Promise<void>((resolve, reject) => {
        wallet.makeOffer(
          args.invitationSpec,
          args.proposal,
          args.offerArgs,
          (update: { status: string; data?: unknown }) => {
            switch (update.status) {
              case 'error':
                reject(new Error(`Offer error: ${update.data}`));
                break;
              case 'accepted':
                toast.success('Offer accepted!');
                resolve();
                break;
              case 'refunded':
                reject(new Error('Offer was rejected'));
                break;
            }
          },
        );
      });

      showSuccess({
        content: 'Transaction Submitted Successfully',
        duration: TOAST_DURATION.SUCCESS,
      });
    } catch (error) {
      showError({ content: error.message, duration: TOAST_DURATION.ERROR });
    } finally {
      if (toastId) toast.dismiss(toastId);
      useAppStore.setState({ loading: false });
    }
  };

  const invitations = currentOffers?.offerToUsedInvitation.filter(
    (invitation) => invitation[1].value[0].instance === contractInstance,
  );
  const latestInvitation = invitations?.sort((a, b) =>
    b[0].localeCompare(a[0]),
  )[0];

  
};
