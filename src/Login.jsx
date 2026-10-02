import React, { useState } from 'react';
import {
    Lightbulb,
    Flame,
    Plus,
    Mail,
    Lock,
    User,
    HelpCircle,
    AlertCircle,
    Loader2
} from 'lucide-react';

// 🔥 Firebase Imports
import { auth, db } from './firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { setItem } from './services/db';

const CARD_THEMES = [
    { bg: 'bg-amber-100/90', border: 'border-amber-200/80', btnBg: 'bg-amber-200/70', btnHover: 'hover:bg-amber-300/80', btnText: 'text-amber-900', fireColor: 'text-amber-600', badgeText: 'text-amber-900/80', borderSep: 'border-amber-200/60' },
    { bg: 'bg-rose-100/90', border: 'border-rose-200/80', btnBg: 'bg-rose-200/70', btnHover: 'hover:bg-rose-300/80', btnText: 'text-rose-900', fireColor: 'text-rose-600', badgeText: 'text-rose-900/80', borderSep: 'border-rose-200/60' },
    { bg: 'bg-sky-100/90', border: 'border-sky-200/80', btnBg: 'bg-sky-200/70', btnHover: 'hover:bg-sky-300/80', btnText: 'text-sky-900', fireColor: 'text-sky-600', badgeText: 'text-sky-900/80', borderSep: 'border-sky-200/60' },
    { bg: 'bg-emerald-100/90', border: 'border-emerald-200/80', btnBg: 'bg-emerald-200/70', btnHover: 'hover:bg-emerald-300/80', btnText: 'text-emerald-900', fireColor: 'text-emerald-600', badgeText: 'text-emerald-900/80', borderSep: 'border-emerald-200/60' }
];

const INITIAL_NOTES = [
    { id: 1, text: "Compost bins near the tuck shop?", author: "Team Alpha", votes: 8, rotation: "-rotate-1", themeIdx: 0 },
    { id: 2, text: "Reusable trays for the cafeteria 🥗", author: "Team Gamma", votes: 14, rotation: "rotate-2", themeIdx: 1 },
    { id: 3, text: "Track how many trays we save weekly", author: "Team Beta", votes: 5, rotation: "rotate-1", themeIdx: 2 },
    { id: 4, text: "Ask the canteen vendor first 🤝", author: "Peer Idea", votes: 11, rotation: "-rotate-2", themeIdx: 3 }
];

export default function Login({ onLogin }) {
    const [authMode, setAuthMode] = useState('signin');
    const [notes, setNotes] = useState(INITIAL_NOTES);
    const [newNoteText, setNewNoteText] = useState('');
    const [toastMessage, setToastMessage] = useState(null);
    const [toastType, setToastType] = useState('info');
    const [loading, setLoading] = useState(false);

    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const showToast = (msg, type = 'info') => {
        setToastMessage(msg);
        setToastType(type);
        setTimeout(() => setToastMessage(null), 3500);
    };

    const handleUpvote = (id) => {
        setNotes(prev => prev.map(note => note.id === id ? { ...note, votes: note.votes + 1 } : note));
        showToast("Note upvoted!");
    };

    const handleAddNote = (e) => {
        e.preventDefault();
        if (!newNoteText.trim()) return showToast("Please enter an idea first!", 'error');

        const randomRotation = ['-rotate-1', 'rotate-1', '-rotate-2', 'rotate-2'][Math.floor(Math.random() * 4)];
        const randomTheme = Math.floor(Math.random() * CARD_THEMES.length);

        setNotes(prev => [...prev, { id: Date.now(), text: newNoteText.trim(), author: "You", votes: 1, rotation: randomRotation, themeIdx: randomTheme }]);
        setNewNoteText('');
        showToast("Idea posted to board!");
    };

    // 🔥 FIREBASE AUTH LOGIC
    const handleSubmit = async (e) => {
        e.preventDefault();
        const cleanEmail = email.trim().toLowerCase();
        let role = null;

        // ✅ New email format: t.name@gmail.com (teacher) | s.name@gmail.com (student)
        if (cleanEmail.startsWith('t.')) role = 'teacher';
        else if (cleanEmail.startsWith('s.')) role = 'student';
        else return showToast("Email 't.name@gmail.com' ya 's.name@gmail.com' format mein honi chahiye!", 'error');

        setLoading(true);
        try {
            let userCred;

            if (authMode === 'signup') {
                userCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
                const finalName = fullName.trim() || (role === 'teacher' ? 'Teacher' : 'Student');

                await setItem('users', userCred.user.uid, {
                    name: finalName,
                    email: cleanEmail,
                    role: role
                });

                showToast("Account created successfully! 🎉");
                onLogin({ uid: userCred.user.uid, email: cleanEmail, name: finalName, role });

            } else {
                userCred = await signInWithEmailAndPassword(auth, cleanEmail, password);

                const userDoc = await getDoc(doc(db, 'users', userCred.user.uid));
                let userName = fullName.trim() || (role === 'teacher' ? 'Teacher User' : 'Student User');
                if (userDoc.exists()) {
                    userName = userDoc.data().name;
                }

                showToast("Logged in successfully! ✅");
                onLogin({ uid: userCred.user.uid, email: cleanEmail, name: userName, role });
            }
        } catch (err) {
            console.error(err);
            let errorMsg = err.message;
            if (err.code === 'auth/email-already-in-use') errorMsg = "Yeh email pehle se registered hai! Sign In karo.";
            if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') errorMsg = "Email ya password galat hai!";
            if (err.code === 'auth/weak-password') errorMsg = "Password kam se kam 6 characters ka hona chahiye.";

            showToast(errorMsg, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col justify-between selection:bg-orange-100 relative">
            {toastMessage && (
                <div className={`fixed top-5 right-5 text-xs font-semibold px-4 py-3 rounded-xl shadow-lg z-50 flex items-center gap-2 animate-bounce ${toastType === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
                    {toastType === 'error' && <AlertCircle className="w-4 h-4" />}
                    <span>{toastMessage}</span>
                </div>
            )}

            {/* Header */}
            <header className="w-full py-4 px-6 md:px-10 flex justify-between items-center z-30 bg-white border-b border-slate-200/80 shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center text-white shadow-sm">
                        <Lightbulb className="w-5 h-5 fill-white/20" />
                    </div>
                    <span className="text-xl font-extrabold tracking-tight text-slate-900">
                        Class<span className="text-orange-600">Brainstorm</span>
                    </span>
                </div>
                <a href="#help" onClick={(e) => { e.preventDefault(); showToast("Support team notified!"); }} className="text-xs font-semibold text-slate-500 hover:text-orange-600 transition-colors flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" /> <span>Help & Support</span>
                </a>
            </header>

            <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 w-full max-w-[1500px] mx-auto">
                {/* Left Side: Idea Board */}
                <section className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center border-r border-slate-200/80 relative overflow-hidden bg-[radial-gradient(#cbd5e1_1.5px,transparent_1.5px)] [background-size:22px_22px]">
                    <div className="max-w-xl mb-6">
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                            Every idea, <span className="text-orange-600 underline decoration-wavy decoration-orange-500 underline-offset-4">one shared board.</span>
                        </h1>
                    </div>

                    <div className="relative min-h-[340px] flex flex-col justify-center">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                            {notes.map((note) => {
                                const theme = CARD_THEMES[note.themeIdx % CARD_THEMES.length];
                                return (
                                    <div key={note.id} onClick={() => handleUpvote(note.id)} className={`${theme.bg} border ${theme.border} ${note.rotation} p-4 rounded-2xl flex flex-col justify-between h-36 cursor-pointer transition-all duration-200 ease-in-out hover:-translate-y-1 hover:scale-[1.02] hover:rotate-0 hover:shadow-lg hover:z-20 shadow-sm`}>
                                        <p className="font-semibold text-slate-800 text-sm leading-snug">"{note.text}"</p>
                                        <div className={`flex items-center justify-between text-xs pt-2 border-t ${theme.borderSep}`}>
                                            <span className={`font-bold ${theme.badgeText}`}>{note.author}</span>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); handleUpvote(note.id); }} className={`flex items-center gap-1 font-bold ${theme.btnText} ${theme.btnBg} ${theme.btnHover} px-2.5 py-1 rounded-lg transition-colors`}>
                                                <Flame className={`w-3.5 h-3.5 fill-current ${theme.fireColor}`} /> <span>{note.votes} votes</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <form onSubmit={handleAddNote} className="mt-6 flex gap-2 items-center bg-white/90 backdrop-blur-sm p-1.5 rounded-xl border border-slate-200 shadow-sm max-w-md">
                            <input type="text" value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} placeholder="Post a quick idea to the board..." className="bg-transparent border-none text-xs px-3 py-1.5 focus:outline-none w-full text-slate-700 placeholder-slate-400" />
                            <button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 shadow-sm active:scale-95">
                                <Plus className="w-3.5 h-3.5" /> <span>Post Note</span>
                            </button>
                        </form>
                    </div>
                </section>

                {/* Right Side: Authentication */}
                <section className="lg:col-span-5 p-6 sm:p-10 flex flex-col justify-center bg-white">
                    <div className="w-full max-w-sm mx-auto space-y-6">
                        {/* Tab Switcher */}
                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/70 text-xs font-semibold">
                            <button type="button" onClick={() => setAuthMode('signin')} className={`flex-1 py-2 rounded-lg transition-all text-center ${authMode === 'signin' ? 'text-slate-900 bg-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-900 font-semibold'}`}>Sign In</button>
                            <button type="button" onClick={() => setAuthMode('signup')} className={`flex-1 py-2 rounded-lg transition-all text-center ${authMode === 'signup' ? 'text-slate-900 bg-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-900 font-semibold'}`}>Sign Up</button>
                        </div>

                        <div>
                            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{authMode === 'signin' ? 'Sign in to your board' : 'Create your account'}</h2>
                            <p className="text-xs text-slate-500 mt-1">
                                Use <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-orange-600">t.name@gmail.com</code> for Teacher view or <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-orange-600">s.name@gmail.com</code> for Student view.
                            </p>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {authMode === 'signup' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Full Name</label>
                                    <div className="relative">
                                        <User className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                                        <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Alex Rivera" className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors" />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">School or institutional email</label>
                                <div className="relative">
                                    <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="t.name@gmail.com or s.name@gmail.com" className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors" />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Password</label>
                                    {authMode === 'signin' && (
                                        <a href="#forgot" onClick={(e) => { e.preventDefault(); showToast("Password reset link sent!"); }} className="text-xs font-semibold text-orange-600 hover:underline">Forgot?</a>
                                    )}
                                </div>
                                <div className="relative">
                                    <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                                    <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors" />
                                </div>
                            </div>

                            <button type="submit" disabled={loading} className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-sm transition-all shadow-md active:scale-95 mt-2 disabled:opacity-70 flex justify-center items-center gap-2">
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                {loading ? 'Processing...' : (authMode === 'signin' ? 'Sign In' : 'Create Account')}
                            </button>
                        </form>
                    </div>
                </section>
            </main>
        </div>
    );
}