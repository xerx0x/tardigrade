import { TardigradeThoughts, connectDB } from "@/components/backend/mongodb";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        await connectDB();

        const Thoughts = await TardigradeThoughts.find()

        return NextResponse.json(Thoughts);
    } catch (error) {
        console.error('Error fetching thoughts:', error);
        return NextResponse.json({ error: 'Error fetching thoughts' }, { status: 500 });
    }
}
