import { NextResponse } from "next/server";
import connectMongo from "@/lib/mongodb";
import User from "@/models/User";
import bcrypt from "bcryptjs";

export async function POST(req) {
  try {
    const { email, password, name, image } = await req.json();
    await connectMongo();

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json({ message: "Cet email est déjà utilisé." }, { status: 400 });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Créer l'utilisateur avec des images par défaut s'il n'en met pas
    await User.create({
      email,
      password: hashedPassword,
      name: name || "Architecte",
      image: image || "https://i.pinimg.com/736x/6e/02/51/6e02519899393fa847d87d57c63e6cf0.jpg"
    });

    return NextResponse.json({ message: "Compte créé avec succès" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: "Erreur serveur lors de l'inscription" }, { status: 500 });
  }
}