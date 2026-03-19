export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import connectMongo from '@/lib/mongodb';
import Ritual from '@/models/Ritual';
import User from '@/models/User';
import { getServerSession } from "next-auth/next";

async function getUserId(email) {
  const user = await User.findOne({ email });
  return user ? user._id.toString() : null;
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  
  await connectMongo();
  const userId = await getUserId(session.user.email);
  const allRituals = await Ritual.find({ userId });
  return NextResponse.json(allRituals);
}

export async function POST(req) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  // LE FIX EST LÀ : On récupère enfin le sandboxId
  const { sandboxId, niveau, nom, targetNiveau, pattern, elements } = await req.json();
  
  await connectMongo();
  const userId = await getUserId(session.user.email);

  try {
    const newRitual = await Ritual.create({ 
      userId, 
      sandboxId, // Et on l'envoie à MongoDB
      niveau, 
      nom, 
      targetNiveau, 
      pattern,      
      elements 
    });
    return NextResponse.json(newRitual);
  } catch (error) {
    console.error("Erreur API Rituels:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  
  await connectMongo();
  const userId = await getUserId(session.user.email);
  await Ritual.findOneAndDelete({ _id: id, userId });
  return NextResponse.json({ success: true });
}