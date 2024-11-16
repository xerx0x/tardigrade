import { Transaction, connectDB } from "@/components/backend/mongodb";
import { NextResponse } from "next/server";

export const revalidate = 60; // Revalidate every 60 seconds
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await connectDB();

        const transactions = await Transaction.find()
            .sort({ blockTime: -1 })
            .limit(100)
            .lean();

        return NextResponse.json(transactions);
    } catch (error) {
        console.error('Error fetching recent transactions:', error);
        return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
    }
}
