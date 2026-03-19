export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import connectMongo from '@/lib/mongodb';
import NodeData from '@/models/NodeData';
import User from '@/models/User';
import { getServerSession } from "next-auth/next";

export async function POST(req) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { updates } = await req.json();
  await connectMongo();
  const user = await User.findOne({ email: session.user.email });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  try {
    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { userId: user._id.toString(), nodeId: update.nodeId },
        update: { $set: { todos: update.todos, activeRituals: update.activeRituals } },
        upsert: true
      }
    }));

    if (bulkOps.length > 0) await NodeData.bulkWrite(bulkOps);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}