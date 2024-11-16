
export type tardigradeHistory = {
    x: number;
    y: number;
    direction: string;
    affectedTransactions: string[]
    index: number;
    timestamp: number;
}

export interface ITransaction extends Document {
    signature: string;
    from: string;
    to: string;
    amount: string;
    slot: number;
    blockTime: number | null;
    activity_type: string;
}