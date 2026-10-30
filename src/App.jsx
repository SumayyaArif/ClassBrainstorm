import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Users, Plus, Trash2, MessageSquare, StickyNote, ThumbsUp,
  Send, Shield, Lock, Globe,
  Calendar, Megaphone, CornerDownRight, Bell, Clock, Edit3, Activity, FileText, LogOut,
  Sparkles, AlertTriangle, Download, X, CheckCircle2, UserCheck, HelpCircle, Eye, UserPlus,
  Flame, Trophy, Award, Star, TrendingUp, EyeOff, Rocket, Layers, Search, Link2, ArrowLeft, Menu
} from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import Login from './Login.jsx';

// 🔥 FIREBASE IMPORTS
import { auth } from './firebase';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { subscribeCollection, addItem, updateItem, deleteItem, setItem } from './services/db';

// ✅ Refresh-persistence helpers (session + current page restore)
const LS_USER = 'cb_user';
const LS_UI = 'cb_ui';
const lsGet = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const lsSet = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ } };
const lsDel = (key) => { try { localStorage.removeItem(key); } catch { /* ignore */ } };
const savedUI = () => lsGet(LS_UI) || {};

// ✅ Text similarity helper
const textSimilarity = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return 0;
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
};

const CANVAS_ZONES = [
  { id: 'zone-policy', label: '📜 Policy Zone', tag: 'Policy', box: 'bg-yellow-100/70 border-yellow-400', x: 16, y: 16, w: 280, h: 240 },
  { id: 'zone-recycling', label: '♻️ Recycling Zone', tag: 'Recycling', box: 'bg-green-100/70 border-green-400', x: 312, y: 16, w: 280, h: 240 },
  { id: 'zone-awareness', label: '📣 Awareness Zone', tag: 'Awareness', box: 'bg-blue-100/70 border-blue-400', x: 16, y: 272, w: 280, h: 240 },
  { id: 'zone-general', label: '🗂️ General / Other', tag: 'General', box: 'bg-slate-100/70 border-slate-400', x: 312, y: 272, w: 280, h: 240 }
];
const CANVAS_HEIGHT = 560;

const DEVELOPMENT_STAGES = [
  { key: 'shortlisted', label: 'Shortlisted',        emoji: '📌', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
  { key: 'developing',  label: 'Under Development',  emoji: '🛠️', cls: 'bg-blue-100 text-blue-700 border-blue-300' },
  { key: 'piloting',    label: 'Pilot / Testing',    emoji: '🧪', cls: 'bg-purple-100 text-purple-700 border-purple-300' },
  { key: 'final',       label: 'Final Solution',     emoji: '✅', cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { key: 'implemented', label: 'Implemented',        emoji: '🚀', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
];

const CLUSTER_COLORS = [
  { bg: 'bg-purple-50/60', border: 'border-purple-300', badge: 'bg-purple-100 text-purple-800 border-purple-300' },
  { bg: 'bg-blue-50/60',   border: 'border-blue-300',   badge: 'bg-blue-100 text-blue-800 border-blue-300' },
  { bg: 'bg-emerald-50/60',border: 'border-emerald-300',badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { bg: 'bg-amber-50/60',  border: 'border-amber-300',  badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  { bg: 'bg-rose-50/60',   border: 'border-rose-300',   badge: 'bg-rose-100 text-rose-800 border-rose-300' },
  { bg: 'bg-cyan-50/60',   border: 'border-cyan-300',   badge: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  { bg: 'bg-fuchsia-50/60',border: 'border-fuchsia-300',badge: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300' },
  { bg: 'bg-indigo-50/60', border: 'border-indigo-300', badge: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
];

// ✅ Real streak helper
const todayStr = () => new Date().toISOString().slice(0, 10);
const yesterdayStr = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const computeStreakUpdate = (student) => {
  const today = todayStr();
  const yesterday = yesterdayStr();
  const lastDate = student?.lastActiveDate || '';
  let newStreak = student?.streak || 0;

  if (lastDate === today) {
    if (newStreak < 1) newStreak = 1;
  } else if (lastDate === yesterday) {
    newStreak = (newStreak || 0) + 1;
  } else {
    newStreak = 1;
  }
  return { streak: newStreak, lastActiveDate: today };
};


// ✅ @mention + edit/delete helpers
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MentionText = ({ text, names }) => {
  if (!text) return null;
  const list = [...new Set(names || [])].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!list.length) return <>{text}</>;
  const re = new RegExp(`(@(?:${list.map(escapeRe).join('|')})(?![\\w]))`, 'gi');
  return <>{text.split(re).map((p, i) => (i % 2 === 1
    ? <span key={i} className="font-bold text-indigo-700 bg-indigo-100/70 rounded px-0.5">{p}</span>
    : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
};

const MentionInput = ({ value, onChange, names, placeholder, className = '', disabled, onEnter, autoFocus }) => {
  const [query, setQuery] = useState(null);
  const ref = useRef(null);
  const detect = (val, caret) => {
    const m = /(^|\s)@([^@\n]{0,20})$/.exec(val.slice(0, caret));
    setQuery(m ? m[2].toLowerCase() : null);
  };
  const matches = query === null ? [] : [...new Set(names || [])].filter(n => n && n.toLowerCase().includes(query)).slice(0, 5);
  const pick = (name) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@[^@\n]{0,20}$/, `@${name} `);
    onChange(before + value.slice(caret));
    setQuery(null);
    setTimeout(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); }, 0);
  };
  return (
    <div className="relative flex-1 min-w-0">
      <input
        ref={ref} type="text" value={value} disabled={disabled} placeholder={placeholder} autoFocus={autoFocus}
        className={`${className} w-full`}
        onChange={(e) => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setQuery(null);
          if ((e.key === 'Enter' || e.key === 'Tab') && matches.length) { e.preventDefault(); pick(matches[0]); return; }
          if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); }
        }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {matches.length > 0 && (
        <div className="absolute bottom-full mb-1 left-0 z-30 w-48 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {matches.map(n => (
            <button key={n} type="button" onMouseDown={(e) => { e.preventDefault(); pick(n); }} className="w-full text-left text-[11px] font-medium text-slate-700 px-2.5 py-1.5 hover:bg-indigo-50">@{n}</button>
          ))}
        </div>
      )}
    </div>
  );
};

const InlineEdit = ({ initial, names, onSave, onCancel }) => {
  const [val, setVal] = useState(initial || '');
  return (
    <div className="flex gap-1 mt-1">
      <MentionInput value={val} onChange={setVal} names={names} autoFocus onEnter={() => onSave(val)} className="text-[11px] px-2 py-1 border border-indigo-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
      <button type="button" onClick={() => onSave(val)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-semibold px-2 rounded">Save</button>
      <button type="button" onClick={onCancel} className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-semibold px-2 rounded">Cancel</button>
    </div>
  );
};

const ActionBtns = ({ canEdit, canDelete, onEdit, onDelete }) => (
  <span className="inline-flex items-center gap-0.5 ml-1.5 align-middle">
    {canEdit && <button type="button" onClick={onEdit} title="Edit" className="p-1 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"><Edit3 className="w-3.5 h-3.5" /></button>}
    {canDelete && <button type="button" onClick={onDelete} title="Delete" className="p-1 rounded text-slate-500 hover:text-red-600 hover:bg-red-50 transition"><Trash2 className="w-3.5 h-3.5" /></button>}
  </span>
);

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => lsGet(LS_USER));
  const [role, setRole] = useState(() => lsGet(LS_USER)?.role || 'student');
  // Firebase ko saved session restore karne ka time do (refresh par login page na dikhe)
  const [authReady, setAuthReady] = useState(false);
  const [currentStudentId, setCurrentStudentId] = useState('');
  const [studentCheckDone, setStudentCheckDone] = useState(false);

  // 🔥 FIREBASE STATE
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [problems, setProblems] = useState([]);
  const [selectedProblemId, setSelectedProblemId] = useState(() => savedUI().selectedProblemId || '');
  const [announcements, setAnnouncements] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  // 📱 Mobile sidebar drawer
  const [showSidebar, setShowSidebar] = useState(false);
  const [selectedStudentForAnalytics, setSelectedStudentForAnalytics] = useState(null);
  const [viewFilter, setViewFilter] = useState('all');

  const [privateChats, setPrivateChats] = useState([]);
  const [problemComments, setProblemComments] = useState([]);

  // Form States
  const [newGroupName, setNewGroupName] = useState('');
  const [groupMemberInputs, setGroupMemberInputs] = useState({});
  const [newChatText, setNewChatText] = useState('');
  const [newProbCommentText, setNewProbCommentText] = useState('');
  const [newIdeaContent, setNewIdeaContent] = useState('');
  const [newIdeaColor, setNewIdeaColor] = useState('bg-yellow-200 border-yellow-400 text-yellow-900');
  const [newIdeaVisibility, setNewIdeaVisibility] = useState('class');
  const [debouncedIdeaContent, setDebouncedIdeaContent] = useState('');
  const [newIdeaCommentMap, setNewIdeaCommentMap] = useState({});
  const [openIdeaCommentsId, setOpenIdeaCommentsId] = useState(null);

  // Teacher Controls States
  const [editingProblem, setEditingProblem] = useState(null);
  const [teacherProblemTitle, setTeacherProblemTitle] = useState('');
  const [teacherProblemDesc, setTeacherProblemDesc] = useState('');
  const [teacherProblemDeadline, setTeacherProblemDeadline] = useState('');
  const [teacherProblemPeerVisible, setTeacherProblemPeerVisible] = useState(true);
  // 🆕 Share problem with all teachers (view only)
  const [teacherProblemShared, setTeacherProblemShared] = useState(false);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [teacherTab, setTeacherTab] = useState(() => savedUI().teacherTab || 'dashboard');

  // ✅ Queries tab: selected problem for detail view
  const [queryProblemId, setQueryProblemId] = useState(() => savedUI().queryProblemId || '');

  const [newAnnouncementText, setNewAnnouncementText] = useState('');
  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState('');
  const [replyTextMap, setReplyTextMap] = useState({});
  const [newStudentReplyMap, setNewStudentReplyMap] = useState({});

  const [timeLeft, setTimeLeft] = useState('');
  const canvasRef = useRef(null);

  const [showAISummary, setShowAISummary] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  // Idea Development / Task Assignment States
  const [developments, setDevelopments] = useState([]);
  const [developIdea, setDevelopIdea] = useState(null);
  const [devStage, setDevStage] = useState('shortlisted');
  const [devNote, setDevNote] = useState('');
  const [devGroupId, setDevGroupId] = useState('');
  const [devDeadline, setDevDeadline] = useState('');
  const [devVisibleToOthers, setDevVisibleToOthers] = useState(true);

  // Clustering & Review Controls
  const [clusterThreshold, setClusterThreshold] = useState(0.35);
  const [expandedClusters, setExpandedClusters] = useState({});
  const [clusterSearch, setClusterSearch] = useState('');
  const [clusterFilter, setClusterFilter] = useState('all');
  const [clusterSort, setClusterSort] = useState('size');

  const [popups, setPopups] = useState([]);
  const showPopup = (title, message, type = 'info') => {
    const id = 'pop_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    setPopups(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setPopups(prev => prev.filter(p => p.id !== id));
    }, 5500);
  };
  const dismissPopup = (id) => setPopups(prev => prev.filter(p => p.id !== id));

  const handleLogin = (user) => {
    let name = user.name;
    if (user.role === 'student' && (!name || name === 'Student User')) name = 'Student';
    const fullUser = { ...user, name };
    setCurrentUser(fullUser);
    setRole(user.role);
    setStudentCheckDone(false);
    lsSet(LS_USER, fullUser);
  };

  const handleLogout = async () => {
    lsDel(LS_USER);
    lsDel(LS_UI);
    await signOut(auth);
    setCurrentUser(null);
    setSelectedProblemId('');
    setTeacherTab('dashboard');
    setQueryProblemId('');
    setCurrentStudentId('');
    setStudentCheckDone(false);
  };

  // 🔐 Refresh par login session restore karo
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        // Firebase mein session nahi hai -> logout
        lsDel(LS_USER);
        setCurrentUser(null);
      } else {
        const saved = lsGet(LS_USER);
        if (saved && saved.uid === fbUser.uid) {
          setCurrentUser(prev => prev || saved);
          setRole(saved.role);
        } else if (saved) {
          // Kisi aur account ka purana data -> clear
          lsDel(LS_USER);
          setCurrentUser(null);
        }
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 💾 Current page / tab save karo taake refresh par wahi page khule
  useEffect(() => {
    if (!currentUser) return;
    lsSet(LS_UI, { teacherTab, selectedProblemId, queryProblemId });
  }, [currentUser, teacherTab, selectedProblemId, queryProblemId]);

  // 🔥 LISTEN TO FIREBASE DATA (REAL-TIME)
  useEffect(() => {
    if (!currentUser || !authReady) return;
    const unsubs = [
      subscribeCollection('students', setStudents),
      subscribeCollection('groups', setGroups),
      subscribeCollection('problems', setProblems),
      subscribeCollection('ideas', setIdeas),
      subscribeCollection('problemComments', setProblemComments),
      subscribeCollection('privateChats', setPrivateChats),
      subscribeCollection('announcements', setAnnouncements),
      subscribeCollection('notifications', setNotifications),
      subscribeCollection('developments', setDevelopments),
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, [currentUser, authReady]);

  // 🔥 MATCH LOGGED-IN STUDENT
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role !== 'student') { setStudentCheckDone(true); return; }
    if (studentCheckDone) return;
    if (students.length === 0) return;

    const existing = students.find(s => s.userId === currentUser.uid);
    if (existing) {
      setCurrentStudentId(existing.id);
      setStudentCheckDone(true);
    } else {
      const newId = 's_' + currentUser.uid.slice(0, 12);
      const newStudent = {
        id: newId, userId: currentUser.uid, email: currentUser.email, name: currentUser.name,
        avatar: '🎓', groupId: '', ideasCount: 0, commentsCount: 0, upvotesGiven: 0,
        problemsAttempted: 0, attemptedProblems: [], streak: 0, lastActiveDate: '', lastActive: 'Just now'
      };
      setItem('students', newId, newStudent);
      setCurrentStudentId(newId);
      setStudentCheckDone(true);
    }
  }, [currentUser, students, studentCheckDone]);

  const currentStudent = students.find(s => s.id === currentStudentId) || null;
  const currentGroup = groups.find(g => g.id === currentStudent?.groupId) || null;
  const [editing, setEditing] = useState(null); // e.g. 'chat:ID', 'ic:ID', 'pc:ID', 'sr:ID', 'tr:ID', 'ti:ID'
  const mentionNames = useMemo(() => ['Teacher', ...students.map(st => st.name)].filter(Boolean), [students]);

  // 🆕 FIX: Only ONE teacher exists (t.teacher@gmail.com) — they own every problem
  const isProblemOwner = (prob) => role === 'teacher';

  // 🆕 FIX: Teacher sees ALL problems — same as students.
  const visibleProblems = useMemo(() => {
    return problems;
  }, [problems]);

  const activeProblem = visibleProblems.find(p => p.id === selectedProblemId) || visibleProblems[0] || problems[0];
  const studentsCanSeeEachOther = activeProblem?.peerResponsesVisible !== false;
  // 🆕 Can the current teacher manage (edit/review) the active problem?
  const canManageActiveProblem = role === 'teacher' && isProblemOwner(activeProblem);

  const leaderboardData = useMemo(() => {
    return [...students].map(s => {
      const studentIdeas = ideas.filter(i => i.studentId === s.id);
      const highRatedIdeas = studentIdeas.filter(i => i.rating >= 4 || i.badge).length;
      const score = (s.ideasCount * 10) + (highRatedIdeas * 15) + (s.upvotesGiven * 2) + ((s.streak || 0) * 5);
      return { ...s, highRatedIdeas, score };
    }).sort((a, b) => b.score - a.score);
  }, [students, ideas]);

  const participationData = useMemo(() => {
    const minsSince = (t) => {
      if (!t || t === 'Just now') return 0;
      const m = /(\d+)\s*min/.exec(t);
      return m ? parseInt(m[1], 10) : 999;
    };
    const scored = students.map(s => ({
      ...s,
      pScore: (s.ideasCount || 0) + (s.commentsCount || 0) + (s.upvotesGiven || 0),
      minsAgo: minsSince(s.lastActive)
    }));
    const maxScore = Math.max(0, ...scored.map(s => s.pScore));
    const avgScore = scored.length ? scored.reduce((a, s) => a + s.pScore, 0) / scored.length : 0;
    return scored.map(s => {
      const attemptedLow = (s.problemsAttempted || 0) < problems.length / 2;
      let status;
      if (s.pScore === 0) status = { key: 'none', label: 'No Participation', emoji: '🚫', cls: 'bg-red-100 text-red-700 border-red-200', note: 'No activity yet' };
      else if (s.pScore < avgScore && (s.minsAgo > 10 || attemptedLow)) status = { key: 'absent', label: 'Absent-minded', emoji: '😴', cls: 'bg-purple-100 text-purple-700 border-purple-200', note: 'Low and inactive' };
      else if (s.pScore >= maxScore * 0.7) status = { key: 'top', label: 'Most Active', emoji: '🌟', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', note: 'Top participant' };
      else if (s.pScore >= avgScore) status = { key: 'active', label: 'Active', emoji: '✅', cls: 'bg-blue-100 text-blue-700 border-blue-200', note: 'Good' };
      else status = { key: 'low', label: 'Low Participation', emoji: '🟡', cls: 'bg-amber-100 text-amber-700 border-amber-200', note: 'Below average' };
      return { ...s, status };
    }).sort((a, b) => b.pScore - a.pScore);
  }, [students, problems]);

  // CLUSTERING
  const clusteredIdeasByProblem = useMemo(() => {
    const result = {};
    problems.forEach(prob => {
      const probIdeas = ideas.filter(i => i.problemId === prob.id);
      const clusters = [];
      const used = new Set();

      probIdeas.forEach((idea, i) => {
        if (used.has(idea.id)) return;
        const cluster = { id: 'cluster_' + prob.id + '_' + i, items: [idea], avgRating: 0, totalVotes: idea.votes || 0, topBadge: idea.badge || '' };
        used.add(idea.id);
        probIdeas.forEach((other, j) => {
          if (j <= i || used.has(other.id)) return;
          let sim = 0;
          try { sim = textSimilarity(idea.content, other.content); } catch (err) { sim = 0; }
          if (typeof sim === 'number' && !isNaN(sim) && sim >= clusterThreshold) {
            cluster.items.push(other);
            used.add(other.id);
          }
        });
        const rated = cluster.items.filter(x => x.rating > 0);
        cluster.avgRating = rated.length ? rated.reduce((s, x) => s + x.rating, 0) / rated.length : 0;
        cluster.totalVotes = cluster.items.reduce((s, x) => s + (x.votes || 0), 0);
        const badges = cluster.items.map(x => x.badge).filter(Boolean);
        cluster.topBadge = badges[0] || '';
        clusters.push(cluster);
      });

      clusters.sort((a, b) => {
        if (b.items.length !== a.items.length) return b.items.length - a.items.length;
        return b.totalVotes - a.totalVotes;
      });
      result[prob.id] = clusters;
    });
    return result;
  }, [ideas, problems, clusterThreshold]);

  const clusterSimilarityMap = useMemo(() => {
    const map = {};
    Object.values(clusteredIdeasByProblem).forEach(clusters => {
      clusters.forEach(cluster => {
        if (cluster.items.length < 2) return;
        cluster.items.forEach(idea => {
          const similarTo = [];
          cluster.items.forEach(other => {
            if (other.id === idea.id) return;
            let sim = 0;
            try { sim = textSimilarity(idea.content, other.content); } catch (e) { sim = 0; }
            if (typeof sim === 'number' && !isNaN(sim) && sim >= clusterThreshold) {
              similarTo.push({ id: other.id, name: other.studentName, sim });
            }
          });
          similarTo.sort((a, b) => b.sim - a.sim);
          map[idea.id] = { similarTo };
        });
      });
    });
    return map;
  }, [clusteredIdeasByProblem, clusterThreshold]);

  const totalSimilarClusters = useMemo(() => {
    let count = 0;
    Object.values(clusteredIdeasByProblem).forEach(clusters => {
      count += clusters.filter(c => c.items.length >= 2).length;
    });
    return count;
  }, [clusteredIdeasByProblem]);

  useEffect(() => {
    if (!activeProblem?.deadline) { setTimeLeft('No Deadline'); return; }
    const interval = setInterval(() => {
      const target = new Date(activeProblem.deadline).getTime();
      const now = new Date().getTime();
      const diff = target - now;
      if (diff <= 0) setTimeLeft('Expired');
      else {
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeProblem]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedIdeaContent(newIdeaContent), 500);
    return () => clearTimeout(timer);
  }, [newIdeaContent]);

  const addNotification = async (text, options = {}) => {
    const { audience = 'all', studentId = null, teacherId = null } = options;
    await addItem('notifications', {
      text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      audience, studentId, teacherId
    });
  };

  const visibleNotifications = useMemo(() => {
    if (!currentUser) return [];
    return notifications.filter(n => {
      const aud = n.audience || 'all';
      if (role === 'student') {
        if (aud === 'all' || aud === 'students') return true;
        if (aud === 'student' && n.studentId === currentStudentId) return true;
        return false;
      }
      if (aud === 'all' || aud === 'teachers') return true;
      if (aud === 'teacher') { if (!n.teacherId) return true; return n.teacherId === currentUser.uid; }
      return false;
    });
  }, [notifications, role, currentStudentId, currentUser]);

  const markProblemAttempted = (student, problemId) => {
    const attempted = student.attemptedProblems || [];
    if (attempted.includes(problemId)) return { attemptedProblems: attempted, problemsAttempted: student.problemsAttempted || 0 };
    return { attemptedProblems: [...attempted, problemId], problemsAttempted: (student.problemsAttempted || 0) + 1 };
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim() || !currentStudent) return;
    const newGId = 'g_' + Date.now();
    await addItem('groups', { id: newGId, name: newGroupName, members: [currentStudentId] });
    await updateItem('students', currentStudentId, { groupId: newGId });
    await addNotification(`👥 You created & joined ${newGroupName}`, { audience: 'student', studentId: currentStudentId });
    setNewGroupName('');
  };

  const handleAddMemberToGroup = async (targetGroupId, e) => {
    if (e) e.preventDefault();
    const name = (groupMemberInputs[targetGroupId] || '').trim();
    if (!name) return;
    const targetGroup = groups.find(g => g.id === targetGroupId);
    if (!targetGroup) return;
    const newSId = 's_' + Date.now();
    const newStudent = {
      id: newSId, name, avatar: '🎓', groupId: targetGroupId,
      ideasCount: 0, commentsCount: 0, upvotesGiven: 0,
      problemsAttempted: 0, attemptedProblems: [],
      streak: 0, lastActiveDate: '', lastActive: 'Just now'
    };
    await setItem('students', newSId, newStudent);
    await updateItem('groups', targetGroupId, { members: [...targetGroup.members, newSId] });
    await addNotification(`👥 You were added to ${targetGroup.name}`, { audience: 'student', studentId: newSId });
    setGroupMemberInputs({ ...groupMemberInputs, [targetGroupId]: '' });
  };

  const handleRemoveMemberFromGroup = async (targetGroupId, studentId) => {
    const targetGroup = groups.find(g => g.id === targetGroupId);
    if (!targetGroup) return;
    await updateItem('groups', targetGroupId, { members: targetGroup.members.filter(id => id !== studentId) });
    await updateItem('students', studentId, { groupId: '' });
    await addNotification(`👥 You were removed from ${targetGroup.name}`, { audience: 'student', studentId });
  };

  const handleSendPrivateChat = async (e) => {
    e.preventDefault();
    if (!newChatText.trim() || !currentGroup || !currentStudent) return;
    await addItem('privateChats', {
      groupId: currentGroup.id, studentId: currentStudentId,
      sender: currentUser?.name || currentStudent.name, text: newChatText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    const streakUpdate = computeStreakUpdate(currentStudent);
    await updateItem('students', currentStudentId, {
      commentsCount: (currentStudent.commentsCount || 0) + 1,
      lastActive: 'Just now', ...streakUpdate
    });
    await notifyMentions(newChatText, 'in your group chat');
    setNewChatText('');
  };

  const handleSendProblemComment = async (e) => {
    e.preventDefault();
    if (!newProbCommentText.trim() || !currentStudent || !activeProblem) return;
    await addItem('problemComments', {
      problemId: activeProblem.id, studentId: currentStudentId,
      studentName: currentUser?.name || currentStudent.name, text: newProbCommentText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      teacherReply: '', studentReplies: []
    });
    const { attemptedProblems, problemsAttempted } = markProblemAttempted(currentStudent, activeProblem.id);
    const streakUpdate = computeStreakUpdate(currentStudent);
    await updateItem('students', currentStudentId, {
      commentsCount: (currentStudent.commentsCount || 0) + 1,
      lastActive: 'Just now', attemptedProblems, problemsAttempted, ...streakUpdate
    });
    await addNotification(`❓ ${currentUser?.name || currentStudent.name} asked a question`, {
      audience: 'teacher',
      teacherId: activeProblem.teacherId || null
    });
    await notifyMentions(newProbCommentText, 'in a question');
    setNewProbCommentText('');
  };

  const handleAddIdea = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!newIdeaContent.trim() || !currentStudent || !activeProblem) return;
    await addItem('ideas', {
      problemId: activeProblem.id,
      groupId: currentGroup?.id || 'g_public',
      groupName: currentGroup?.name || 'Independent',
      studentId: currentStudent.id,
      studentName: currentUser?.name || currentStudent.name,
      content: newIdeaContent, color: newIdeaColor, tag: 'General',
      votes: 1, teacherReply: '', rating: 0, badge: '',
      visibleToStudents: true,
      teacherOnly: newIdeaVisibility === 'teacher'
    });
    const { attemptedProblems, problemsAttempted } = markProblemAttempted(currentStudent, activeProblem.id);
    const streakUpdate = computeStreakUpdate(currentStudent);
    await updateItem('students', currentStudentId, {
      ideasCount: (currentStudent.ideasCount || 0) + 1,
      lastActive: 'Just now', attemptedProblems, problemsAttempted, ...streakUpdate
    });
    const visibilityNote = newIdeaVisibility === 'teacher' ? ' (Teacher only 🔒)' : '';
    await addNotification(`💡 ${currentUser?.name || currentStudent.name} posted a new idea${visibilityNote}`, {
      audience: 'teacher',
      teacherId: activeProblem.teacherId || null
    });
    showPopup(
      newIdeaVisibility === 'teacher' ? '🔒 Private Idea Posted' : '💡 New Idea Posted',
      `${currentUser?.name || currentStudent.name}: "${newIdeaContent.slice(0, 60)}${newIdeaContent.length > 60 ? '…' : ''}"`,
      'idea'
    );
    setNewIdeaContent('');
    setDebouncedIdeaContent('');
    setNewIdeaVisibility('class');
  };

  const duplicateMatch = useMemo(() => {
    try {
      if (!debouncedIdeaContent || debouncedIdeaContent.trim().length < 8) return null;
      if (role !== 'teacher') return null;
      const pool = ideas.filter(i => i.problemId === activeProblem?.id);
      let best = null, bestScore = 0;
      pool.forEach(idea => {
        if (!idea || typeof idea.content !== 'string' || !idea.content) return;
        let score = 0;
        try { score = textSimilarity(debouncedIdeaContent, idea.content); } catch (err) { score = 0; }
        if (typeof score === 'number' && !isNaN(score) && score > bestScore) { bestScore = score; best = idea; }
      });
      if (best && bestScore >= 0.42) return { idea: best, score: bestScore };
      return null;
    } catch (err) { return null; }
  }, [debouncedIdeaContent, ideas, activeProblem?.id, role]);

  const handleUpvoteIdea = async (id) => {
    const idea = ideas.find(i => i.id === id);
    if (idea && currentStudent) {
      await updateItem('ideas', id, { votes: (idea.votes || 0) + 1 });
      const streakUpdate = computeStreakUpdate(currentStudent);
      await updateItem('students', currentStudentId, {
        upvotesGiven: (currentStudent.upvotesGiven || 0) + 1,
        lastActive: 'Just now', ...streakUpdate
      });
    }
  };

  const handleAddIdeaComment = async (ideaId) => {
    const text = (newIdeaCommentMap[ideaId] || '').trim();
    if (!text || !currentStudent) return;
    const idea = ideas.find(i => i.id === ideaId);
    const newComment = {
      id: 'ic_' + Date.now(), studentId: currentStudentId,
      studentName: currentUser?.name || currentStudent?.name || 'Student', text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    await updateItem('ideas', ideaId, { ideaComments: [...(idea.ideaComments || []), newComment] });
    const streakUpdate = computeStreakUpdate(currentStudent);
    await updateItem('students', currentStudentId, {
      commentsCount: (currentStudent.commentsCount || 0) + 1,
      lastActive: 'Just now', ...streakUpdate
    });
    if (idea && idea.studentId !== currentStudentId) {
      await addNotification(`💬 ${currentUser?.name || currentStudent.name} commented on your idea`, { audience: 'student', studentId: idea.studentId });
    }
    await notifyMentions(text, 'in a comment');
    setNewIdeaCommentMap({ ...newIdeaCommentMap, [ideaId]: '' });
  };

  const handleToggleIdeaVisibility = async (ideaId) => {
    const idea = ideas.find(i => i.id === ideaId);
    if (!idea) return;
    const prob = problems.find(p => p.id === idea.problemId);
    if (prob && !isProblemOwner(prob)) {
      showPopup('🔒 Not Allowed', 'Only the problem creator can hide/show opinions.', 'teacher');
      return;
    }
    const currentlyHidden = idea?.visibleToStudents === false;
    const willBeVisible = currentlyHidden;
    await updateItem('ideas', ideaId, { visibleToStudents: willBeVisible });
    if (idea) {
      await addNotification(
        willBeVisible ? `👁️ Your idea is now visible to classmates` : `🙈 Teacher hid your idea from classmates`,
        { audience: 'student', studentId: idea.studentId }
      );
    }
    showPopup(
      willBeVisible ? '👁️ Opinion Visible to Class' : '🙈 Opinion Hidden from Classmates',
      willBeVisible ? `${idea?.studentName}'s opinion is now visible to all students.` : `${idea?.studentName}'s opinion is now hidden from classmates — but ${idea?.studentName} can still see their own.`,
      'teacher'
    );
  };

  const handleToggleTeacherOnly = async (ideaId) => {
    const idea = ideas.find(i => i.id === ideaId);
    if (!idea) return;
    const willBeTeacherOnly = !idea.teacherOnly;
    await updateItem('ideas', ideaId, { teacherOnly: willBeTeacherOnly });
    showPopup(
      willBeTeacherOnly ? '🔒 Now Teacher-Only' : '🌐 Now Visible to Class',
      willBeTeacherOnly ? 'Only the teacher and you can see this opinion.' : 'This opinion will now be visible to all classmates.',
      'idea'
    );
  };

  const handleToggleStudentsVisibility = async (probId) => {
    const prob = problems.find(p => p.id === probId);
    if (!prob) return;
    if (!isProblemOwner(prob)) {
      showPopup('🔒 Not Allowed', 'Only the problem creator can change visibility.', 'teacher');
      return;
    }
    const currentlyVisible = prob.peerResponsesVisible !== false;
    const willBeVisible = !currentlyVisible;
    await updateItem('problems', probId, { peerResponsesVisible: willBeVisible });
    showPopup(willBeVisible ? '👁️ Visible' : '🙈 Hidden', `${prob.title}`, 'teacher');
  };

  const handleToggleProblemShare = async (probId) => {
    const prob = problems.find(p => p.id === probId);
    if (!prob) return;
    if (!isProblemOwner(prob)) {
      showPopup('🔒 Not Allowed', 'Only the problem creator can change sharing settings.', 'teacher');
      return;
    }
    const willShare = !prob.sharedWithTeachers;
    await updateItem('problems', probId, { sharedWithTeachers: willShare });
    showPopup(
      willShare ? '🌍 Shared with All Teachers' : '🔒 Sharing Turned Off',
      willShare
        ? `"${prob.title}" is now visible to all teachers (view-only). Only you can review it.`
        : `"${prob.title}" is now private to you again.`,
      'teacher'
    );
  };

  const handleSaveProblem = async (e) => {
    e.preventDefault();
    if (!teacherProblemTitle.trim()) return;
    if (editingProblem) {
      if (!isProblemOwner(editingProblem)) {
        showPopup('🔒 Not Allowed', 'Only the problem creator can edit this.', 'teacher');
        return;
      }
      await updateItem('problems', editingProblem.id, {
        title: teacherProblemTitle, description: teacherProblemDesc,
        deadline: teacherProblemDeadline, peerResponsesVisible: teacherProblemPeerVisible,
        sharedWithTeachers: teacherProblemShared
      });
      setEditingProblem(null);
    } else {
      const newProbId = 'p_' + Date.now();
      await setItem('problems', newProbId, {
        id: newProbId, title: teacherProblemTitle,
        description: teacherProblemDesc || 'Collaborative solution design.',
        createdTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        deadline: teacherProblemDeadline || '2026-12-31T23:59',
        peerResponsesVisible: teacherProblemPeerVisible,
        sharedWithTeachers: teacherProblemShared,
        teacherId: currentUser?.uid || null,
        teacherName: currentUser?.name || 'Teacher'
      });
      setSelectedProblemId(newProbId);
      await addNotification(`📋 New problem: ${teacherProblemTitle}`, { audience: 'students' });
      showPopup('📋 New Problem Posted', `Teacher posted: "${teacherProblemTitle}"`, 'teacher');
    }
    setTeacherProblemTitle('');
    setTeacherProblemDesc('');
    setTeacherProblemDeadline('');
    setTeacherProblemPeerVisible(true);
    setTeacherProblemShared(false);
    setShowTeacherModal(false);
  };

  const handleDeleteProblem = async (probId) => {
    const prob = problems.find(p => p.id === probId);
    if (!prob) return;
    if (!isProblemOwner(prob)) {
      showPopup('🔒 Not Allowed', 'Only the problem creator can delete this.', 'teacher');
      return;
    }
    if (confirm("Are you sure you want to delete this problem?")) {
      await deleteItem('problems', probId);
      if (selectedProblemId === probId && problems.length > 1) setSelectedProblemId(problems.find(p => p.id !== probId).id);
      if (queryProblemId === probId) setQueryProblemId('');
    }
  };

  const handleEditProblemClick = (prob) => {
    if (!isProblemOwner(prob)) {
      showPopup('🔒 Not Allowed', 'Only the problem creator can edit this.', 'teacher');
      return;
    }
    setEditingProblem(prob);
    setTeacherProblemTitle(prob.title);
    setTeacherProblemDesc(prob.description);
    setTeacherProblemDeadline(prob.deadline || '');
    setTeacherProblemPeerVisible(prob.peerResponsesVisible !== false);
    setTeacherProblemShared(prob.sharedWithTeachers === true);
    setShowTeacherModal(true);
  };

  const handleRateIdea = async (ideaId, rating) => {
    const idea = ideas.find(i => i.id === ideaId);
    if (!idea) return;
    const prob = problems.find(p => p.id === idea.problemId);
    if (prob && !isProblemOwner(prob)) {
      showPopup('🔒 Not Allowed', 'Only the problem creator can rate ideas.', 'teacher');
      return;
    }
    await updateItem('ideas', ideaId, { rating });
    if (idea) await addNotification(`⭐ Your idea got ${rating}★ rating`, { audience: 'student', studentId: idea.studentId });
  };

  const handleSetBadge = async (ideaId, badge) => {
    const idea = ideas.find(i => i.id === ideaId);
    if (!idea) return;
    const prob = problems.find(p => p.id === idea.problemId);
    if (prob && !isProblemOwner(prob)) {
      showPopup('🔒 Not Allowed', 'Only the problem creator can award badges.', 'teacher');
      return;
    }
    await updateItem('ideas', ideaId, { badge });
    if (badge && idea) {
      await addNotification(`🏆 You got a badge: "${badge}"`, { audience: 'student', studentId: idea.studentId });
      showPopup('🏆 Badge Awarded', `${idea?.studentName || 'A student'}'s idea got "${badge}"`, 'teacher');
    }
  };

  const handleBulkRateCluster = async (cluster, rating) => {
    const firstIdea = cluster.items[0];
    if (firstIdea) {
      const prob = problems.find(p => p.id === firstIdea.problemId);
      if (prob && !isProblemOwner(prob)) {
        showPopup('🔒 Not Allowed', 'Only the problem creator can rate ideas.', 'teacher');
        return;
      }
    }
    for (const idea of cluster.items) {
      await updateItem('ideas', idea.id, { rating });
      await addNotification(`⭐ Your idea got ${rating}★ rating`, { audience: 'student', studentId: idea.studentId });
    }
    showPopup('⭐ Cluster Rated', `Rated ${cluster.items.length} ideas in cluster as ${rating}★`, 'teacher');
  };

  const handleBulkBadgeCluster = async (cluster, badge) => {
    const firstIdea = cluster.items[0];
    if (firstIdea) {
      const prob = problems.find(p => p.id === firstIdea.problemId);
      if (prob && !isProblemOwner(prob)) {
        showPopup('🔒 Not Allowed', 'Only the problem creator can award badges.', 'teacher');
        return;
      }
    }
    for (const idea of cluster.items) {
      await updateItem('ideas', idea.id, { badge });
      if (badge) await addNotification(`🏆 You got a badge: "${badge}"`, { audience: 'student', studentId: idea.studentId });
    }
    if (badge) showPopup('🏆 Cluster Badge', `${cluster.items.length} ideas awarded "${badge}"`, 'teacher');
  };

  const toggleCluster = (clusterId) => setExpandedClusters(prev => ({ ...prev, [clusterId]: !prev[clusterId] }));

  const getDevelopment = (ideaId) => developments.find(d => d.ideaId === ideaId);

  const handleOpenDevelop = (idea) => {
    const prob = problems.find(p => p.id === idea.problemId);
    if (prob && !isProblemOwner(prob)) {
      showPopup('🔒 Not Allowed', 'Only the problem creator can assign tasks.', 'teacher');
      return;
    }
    const existing = getDevelopment(idea.id);
    setDevelopIdea(idea);
    setDevStage(existing?.stage || 'shortlisted');
    setDevNote(existing?.note || '');
    setDevGroupId(existing?.groupId || idea.groupId || '');
    setDevDeadline(existing?.deadline || '');
    setDevVisibleToOthers(existing?.visibleToOthers !== false);
  };

  const handleSaveDevelopment = async (e) => {
    e.preventDefault();
    if (!developIdea) return;
    const prob = problems.find(p => p.id === developIdea.problemId);
    if (prob && !isProblemOwner(prob)) {
      showPopup('🔒 Not Allowed', 'Only the problem creator can assign tasks.', 'teacher');
      return;
    }
    const group = groups.find(g => g.id === devGroupId);
    const payload = {
      ideaId: developIdea.id, stage: devStage, note: devNote,
      groupId: devGroupId, groupName: group?.name || 'Whole Class',
      deadline: devDeadline, visibleToOthers: devVisibleToOthers,
      teacherId: currentUser?.uid || null, updatedAt: new Date().toLocaleString()
    };
    const existing = getDevelopment(developIdea.id);
    if (existing) await updateItem('developments', existing.id, payload);
    else await setItem('developments', developIdea.id, { id: 'dev_' + Date.now(), createdAt: new Date().toLocaleString(), ...payload });

    const s = DEVELOPMENT_STAGES.find(x => x.key === devStage);
    await addNotification(`🎯 Task assigned: "${developIdea.content.slice(0, 40)}…" → ${s.emoji} ${s.label}`, { audience: 'student', studentId: developIdea.studentId });
    if (devGroupId && group) {
      for (const mid of group.members) {
        if (mid !== developIdea.studentId) await addNotification(`🎯 New task in ${group.name}: ${s.emoji} ${s.label}`, { audience: 'student', studentId: mid });
      }
    }
    showPopup('🚀 Task Assigned', `"${developIdea.content.slice(0, 50)}…" → ${s.emoji} ${s.label}${group ? ' • ' + group.name : ''}`, 'teacher');
    setDevelopIdea(null);
  };

  const handleCreateAnnouncement = async (e) => {
    e.preventDefault();
    if (!newAnnouncementTitle.trim() || !newAnnouncementText.trim()) return;
    await addItem('announcements', {
      title: newAnnouncementTitle, content: newAnnouncementText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      teacherId: currentUser?.uid || null
    });
    await addNotification(`📢 Announcement: ${newAnnouncementTitle}`, { audience: 'all' });
    showPopup('📢 New Announcement', `${newAnnouncementTitle}: ${newAnnouncementText.slice(0, 70)}...`, 'teacher');
    setNewAnnouncementTitle('');
    setNewAnnouncementText('');
  };

  const handleReplyToIdea = async (ideaId) => {
    const reply = replyTextMap[ideaId];
    if (!reply || !reply.trim()) return;
    const idea = ideas.find(i => i.id === ideaId);
    if (idea) {
      const prob = problems.find(p => p.id === idea.problemId);
      if (prob && !isProblemOwner(prob)) {
        showPopup('🔒 Not Allowed', 'Only the problem creator can reply to ideas.', 'teacher');
        return;
      }
    }
    await updateItem('ideas', ideaId, { teacherReply: reply });
    await notifyMentions(reply, 'in feedback');
    setReplyTextMap({ ...replyTextMap, [ideaId]: '' });
    if (idea) await addNotification(`💬 Teacher replied to your idea`, { audience: 'student', studentId: idea.studentId });
    showPopup('✅ Teacher Replied to an Idea', reply, 'teacher');
  };

  const handleReplyToComment = async (commentId) => {
    const reply = replyTextMap[commentId];
    if (!reply || !reply.trim()) return;
    const comment = problemComments.find(c => c.id === commentId);
    if (comment) {
      const prob = problems.find(p => p.id === comment.problemId);
      if (prob && !isProblemOwner(prob)) {
        showPopup('🔒 Not Allowed', 'Only the problem creator can reply to questions.', 'teacher');
        return;
      }
    }
    await updateItem('problemComments', commentId, { teacherReply: reply });
    await notifyMentions(reply, 'in a reply');
    setReplyTextMap({ ...replyTextMap, [commentId]: '' });
    if (comment) await addNotification(`💬 Teacher replied to your question`, { audience: 'student', studentId: comment.studentId });
    showPopup('✅ Teacher Replied', reply, 'teacher');
  };

  const handleStudentReplyToComment = async (commentId) => {
    const reply = newStudentReplyMap[commentId];
    if (!reply || !reply.trim() || !currentStudent) return;
    const comment = problemComments.find(c => c.id === commentId);
    const replyObj = {
      id: 'scr_' + Date.now(), studentId: currentStudentId,
      studentName: currentUser?.name || currentStudent.name, text: reply.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    await updateItem('problemComments', commentId, { studentReplies: [...(comment.studentReplies || []), replyObj] });
    const { attemptedProblems, problemsAttempted } = markProblemAttempted(currentStudent, comment?.problemId || activeProblem?.id);
    const streakUpdate = computeStreakUpdate(currentStudent);
    await updateItem('students', currentStudentId, {
      commentsCount: (currentStudent.commentsCount || 0) + 1,
      lastActive: 'Just now', attemptedProblems, problemsAttempted, ...streakUpdate
    });
    if (comment && comment.studentId !== currentStudentId) {
      await addNotification(`💬 ${currentUser?.name || currentStudent.name} replied to your question`, { audience: 'student', studentId: comment.studentId });
    }
    const probOfComment = problems.find(p => p.id === (comment?.problemId || activeProblem?.id));
    await addNotification(`💬 ${currentUser?.name || currentStudent.name} replied to a classmate`, {
      audience: 'teacher',
      teacherId: probOfComment?.teacherId || null
    });
    await notifyMentions(reply, 'in a reply');
    setNewStudentReplyMap({ ...newStudentReplyMap, [commentId]: '' });
  };

  // ✅ @mention notifications
  const notifyMentions = async (text, where) => {
    if (!text) return;
    const me = currentUser?.name || currentStudent?.name || 'Someone';
    for (const st of students) {
      if (!st.name || st.id === currentStudentId) continue;
      if (new RegExp('@' + escapeRe(st.name) + '(?![\\w])', 'i').test(text)) {
        await addNotification(`🔔 ${me} mentioned you ${where}`, { audience: 'student', studentId: st.id });
      }
    }
    if (role === 'student' && /@teacher(?![\w])/i.test(text)) {
      await addNotification(`🔔 ${me} mentioned you ${where}`, { audience: 'teacher', teacherId: activeProblem?.teacherId || null });
    }
  };

  // ✅ Edit / Delete for comments & replies
  const confirmDelete = (what) => window.confirm(`Delete this ${what}?`);
  const bumpComments = async (studentId, d) => {
    const st = students.find(x => x.id === studentId);
    if (st) await updateItem('students', st.id, { commentsCount: Math.max(0, (st.commentsCount || 0) + d) });
  };
  const patchList = (item, field, id, patch) => (item[field] || []).map(x => x.id === id ? { ...x, ...patch } : x);

  const handleEditChat = async (id, text) => {
    const t = text.trim(); if (!t) return;
    await updateItem('privateChats', id, { text: t, edited: true });
    await notifyMentions(t, 'in your group chat'); setEditing(null);
  };
  const handleDeleteChat = async (chat) => {
    if (!confirmDelete('message')) return;
    await deleteItem('privateChats', chat.id); await bumpComments(chat.studentId, -1);
  };
  const handleEditIdeaComment = async (idea, cid, text) => {
    const t = text.trim(); if (!t) return;
    await updateItem('ideas', idea.id, { ideaComments: patchList(idea, 'ideaComments', cid, { text: t, edited: true }) });
    await notifyMentions(t, 'in a comment'); setEditing(null);
  };
  const handleDeleteIdeaComment = async (idea, c) => {
    if (!confirmDelete('comment')) return;
    await updateItem('ideas', idea.id, { ideaComments: (idea.ideaComments || []).filter(x => x.id !== c.id) });
    await bumpComments(c.studentId, -1);
  };
  const handleEditQuestion = async (pc, text) => {
    const t = text.trim(); if (!t) return;
    await updateItem('problemComments', pc.id, { text: t, edited: true });
    await notifyMentions(t, 'in a question'); setEditing(null);
  };
  const handleDeleteQuestion = async (pc) => {
    if (!confirmDelete('question (its replies will be removed too)')) return;
    await deleteItem('problemComments', pc.id); await bumpComments(pc.studentId, -1);
  };
  const handleEditStudentReply = async (pc, rid, text) => {
    const t = text.trim(); if (!t) return;
    await updateItem('problemComments', pc.id, { studentReplies: patchList(pc, 'studentReplies', rid, { text: t, edited: true }) });
    await notifyMentions(t, 'in a reply'); setEditing(null);
  };
  const handleDeleteStudentReply = async (pc, sr) => {
    if (!confirmDelete('reply')) return;
    await updateItem('problemComments', pc.id, { studentReplies: (pc.studentReplies || []).filter(x => x.id !== sr.id) });
    await bumpComments(sr.studentId, -1);
  };
  const handleEditTeacherReply = async (col, id, text) => {
    const t = text.trim(); if (!t) return;
    await updateItem(col, id, { teacherReply: t, teacherReplyEdited: true });
    await notifyMentions(t, 'in a reply'); setEditing(null);
  };
  const handleDeleteTeacherReply = async (col, id) => {
    if (!confirmDelete('reply')) return;
    await updateItem(col, id, { teacherReply: '', teacherReplyEdited: false });
  };

  // ✅ Student apni post (idea) delete kar sakta hai
  const handleDeleteIdea = async (idea) => {
    if (!idea || idea.studentId !== currentStudentId) return;
    if (!confirmDelete('post (its comments will be removed too)')) return;
    try {
      await deleteItem('ideas', idea.id);
      const linkedDevs = developments.filter(d => d.ideaId === idea.id);
      for (const d of linkedDevs) { await deleteItem('developments', d.id); }
      const st = students.find(x => x.id === idea.studentId);
      if (st) await updateItem('students', st.id, { ideasCount: Math.max(0, (st.ideasCount || 0) - 1) });
      if (openIdeaCommentsId === idea.id) setOpenIdeaCommentsId(null);
      showPopup('🗑️ Post Deleted', 'Your post has been removed.', 'info');
    } catch (err) {
      console.error('Delete idea failed:', err);
      showPopup('⚠️ Delete Failed', 'Could not delete the post. Please try again.', 'info');
    }
  };

  const handleExportReport = () => {
    const totalIdeas = ideas.length;
    const reportWindow = window.open('', '_blank');
    const reportHTML = `
      <html>
        <head>
          <title>Classroom Brainstorming Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; }
            h1 { color: #0f172a; border-bottom: 2px solid #0284c7; padding-bottom: 10px; }
            h2 { color: #0284c7; margin-top: 25px; }
            .metric { display: inline-block; background: #f1f5f9; padding: 10px 20px; border-radius: 8px; margin-right: 15px; margin-bottom: 15px; }
            .metric strong { font-size: 20px; color: #0f172a; display: block; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
            th { background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>CLASSROOM BRAINSTORMING REPORT</h1>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()} | <strong>Generated by:</strong> ${currentUser?.name || 'Instructor'}</p>
          <div class="metric">Problem:<strong>${activeProblem?.title || '—'}</strong></div>
          <div class="metric">Groups:<strong>${groups.length}</strong></div>
          <div class="metric">Total Students:<strong>${students.length}</strong></div>
          <div class="metric">Total Ideas:<strong>${totalIdeas}</strong></div>
          <h2>Group Activity Breakdown</h2>
          <table><thead><tr><th>Group Name</th><th>Members</th><th>Ideas Posted</th></tr></thead><tbody>
            ${groups.map(g => {
              const gStudents = students.filter(s => s.groupId === g.id);
              const gIdeas = ideas.filter(i => i.groupId === g.id).length;
              return `<tr><td>${g.name}</td><td>${gStudents.map(s => s.name).join(', ')}</td><td>${gIdeas}</td></tr>`;
            }).join('')}
          </tbody></table>
          <h2>Student Participation & Leaderboard</h2>
          <table><thead><tr><th>Student</th><th>Ideas</th><th>Comments</th><th>Streak 🔥</th><th>Upvotes Given</th><th>Last Active</th></tr></thead><tbody>
            ${students.map(s => `<tr><td>${s.name}</td><td>${s.ideasCount}</td><td>${s.commentsCount}</td><td>${s.streak || 0} Days</td><td>${s.upvotesGiven}</td><td>${s.lastActive}</td></tr>`).join('')}
          </tbody></table>
          <h2>Top Rated Ideas</h2>
          <ul>
            ${ideas.filter(i => i.rating >= 4).map(i => `<li><strong>${i.studentName} (${i.tag}):</strong> "${i.content}" — Rated ${i.rating}/5 ⭐ (${i.badge || 'Featured'})</li>`).join('')}
          </ul>
        </body>
      </html>
    `;
    reportWindow.document.write(reportHTML);
    reportWindow.document.close();
    reportWindow.print();
  };

  const handleGenerateAISummary = () => {
    const relevant = ideas.filter(i => i.problemId === activeProblem?.id);
    if (relevant.length === 0) { showPopup('✨ AI Summary', 'No ideas yet.', 'info'); return; }
    setGeneratingSummary(true);
    setTimeout(() => {
      const tagCounts = {};
      relevant.forEach(i => { tagCounts[i.tag] = (tagCounts[i.tag] || 0) + 1; });
      const topThemes = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count, pct: Math.round((count / relevant.length) * 100) }));
      const keySolutions = [...relevant].sort((a, b) => (b.votes + b.rating * 2) - (a.votes + a.rating * 2)).slice(0, 3);
      const actionPoints = relevant.filter(i => i.rating >= 4 || i.badge).sort((a, b) => b.rating - a.rating).slice(0, 5);
      const duplicates = [];
      for (let i = 0; i < relevant.length; i++) {
        for (let j = i + 1; j < relevant.length; j++) {
          let sim = 0;
          try { sim = textSimilarity(relevant[i].content, relevant[j].content); } catch (err) { sim = 0; }
          if (typeof sim === 'number' && !isNaN(sim) && sim >= 0.40) duplicates.push({ idea1: relevant[i], idea2: relevant[j], similarity: Math.round(sim * 100) });
        }
      }
      const summary = {
        problemTitle: activeProblem.title, totalIdeas: relevant.length,
        totalVotes: relevant.reduce((sum, i) => sum + i.votes, 0),
        topThemes, keySolutions,
        actionPoints: actionPoints.length ? actionPoints : keySolutions.slice(0, 2),
        duplicates, generatedAt: new Date().toLocaleString()
      };
      setAiSummary(summary);
      setGeneratingSummary(false);
      setShowAISummary(true);
    }, 700);
  };

  // ✅ DETAILED EXCEL EXPORT — 22 sheets
  const handleExportExcel = () => {
    const workbook = XLSX.utils.book_new();
    const generatedAt = new Date().toLocaleString();
    const stageLabel = (key) => {
      const s = DEVELOPMENT_STAGES.find(x => x.key === key);
      return s ? `${s.emoji} ${s.label}` : '—';
    };

    const nowMs = Date.now();
    const taskStatusOf = (d) => {
      if (d.stage === 'implemented') return { key: 'done', label: '✅ Completed', daysLeft: '—' };
      if (!d.deadline) return { key: 'nodeadline', label: '⏳ No Deadline', daysLeft: '—' };
      const t = new Date(d.deadline).getTime();
      if (isNaN(t)) return { key: 'nodeadline', label: '⏳ No Deadline', daysLeft: '—' };
      const diffDays = Math.ceil((t - nowMs) / 86400000);
      if (t < nowMs) return { key: 'overdue', label: '🔴 Overdue', daysLeft: diffDays };
      if (diffDays <= 2) return { key: 'soon', label: '🟠 Due Soon', daysLeft: diffDays };
      return { key: 'ontrack', label: '🟢 On Track', daysLeft: diffDays };
    };
    const stageProgressPct = (key) => {
      const idx = DEVELOPMENT_STAGES.findIndex(s => s.key === key);
      return idx < 0 ? 0 : Math.round(((idx + 1) / DEVELOPMENT_STAGES.length) * 100);
    };

    const totalIdeasCount = ideas.length;
    const totalVotesCount = ideas.reduce((s, i) => s + (i.votes || 0), 0);
    const ratedIdeasCount = ideas.filter(i => i.rating > 0).length;
    const avgRatingVal = ratedIdeasCount ? (ideas.reduce((s, i) => s + (i.rating || 0), 0) / ratedIdeasCount).toFixed(2) : '0.00';
    const hiddenIdeas = ideas.filter(i => i.visibleToStudents === false).length;
    const teacherOnlyIdeas = ideas.filter(i => i.teacherOnly === true).length;
    const totalTaskAssignments = developments.length;
    const implementedTasks = developments.filter(d => d.stage === 'implemented').length;
    const totalQuestions = problemComments.length;
    const totalReplies = problemComments.reduce((s, pc) => s + (pc.studentReplies || []).length, 0);
    const totalIdeaComments = ideas.reduce((s, i) => s + (i.ideaComments || []).length, 0);

    const overviewRows = [
      { Section: '📅 REPORT INFO', Item: 'Report Generated', Details: generatedAt },
      { Section: '📅 REPORT INFO', Item: 'Generated By', Details: `${currentUser?.name || 'Teacher'} (${currentUser?.email || '—'})` },
      { Section: '📅 REPORT INFO', Item: 'Role', Details: role === 'teacher' ? 'Teacher / Instructor' : 'Student' },
      { Section: '📅 REPORT INFO', Item: 'Total Problems', Details: visibleProblems.length },
      { Section: '📅 REPORT INFO', Item: 'Total Groups', Details: groups.length },
      { Section: '📅 REPORT INFO', Item: 'Total Students', Details: students.length },
      { Section: '📊 CONTENT STATS', Item: 'Total Ideas Posted', Details: totalIdeasCount },
      { Section: '📊 CONTENT STATS', Item: 'Rated Ideas', Details: ratedIdeasCount },
      { Section: '📊 CONTENT STATS', Item: 'Unrated Ideas', Details: totalIdeasCount - ratedIdeasCount },
      { Section: '📊 CONTENT STATS', Item: 'Average Rating (of rated)', Details: avgRatingVal },
      { Section: '📊 CONTENT STATS', Item: 'Total Upvotes', Details: totalVotesCount },
      { Section: '📊 CONTENT STATS', Item: 'Hidden Ideas (from students)', Details: hiddenIdeas },
      { Section: '📊 CONTENT STATS', Item: 'Teacher-Only Ideas', Details: teacherOnlyIdeas },
      { Section: '📊 CONTENT STATS', Item: 'Similar Idea Clusters (2+)', Details: totalSimilarClusters },
      { Section: '🚀 TASKS', Item: 'Total Task Assignments', Details: totalTaskAssignments },
      { Section: '🚀 TASKS', Item: 'Implemented Tasks', Details: implementedTasks },
      { Section: '❓ DISCUSSIONS', Item: 'Student Questions Posted', Details: totalQuestions },
      { Section: '❓ DISCUSSIONS', Item: 'Student Replies to Questions', Details: totalReplies },
      { Section: '💬 DISCUSSIONS', Item: 'Comments on Ideas', Details: totalIdeaComments },
      { Section: '📢 ANNOUNCEMENTS', Item: 'Total Announcements', Details: announcements.length },
    ];
    overviewRows.push(
      { Section: '🚀 TASKS', Item: 'Completed Tasks (Implemented)', Details: developments.filter(d => taskStatusOf(d).key === 'done').length },
      { Section: '🚀 TASKS', Item: 'In-Progress Tasks', Details: developments.filter(d => taskStatusOf(d).key !== 'done').length },
      { Section: '🚀 TASKS', Item: '🔴 Overdue Tasks', Details: developments.filter(d => taskStatusOf(d).key === 'overdue').length },
      { Section: '🚀 TASKS', Item: '🟠 Tasks Due Within 2 Days', Details: developments.filter(d => taskStatusOf(d).key === 'soon').length },
      { Section: '👥 STUDENTS', Item: 'Students With No Participation', Details: participationData.filter(p => p.status.key === 'none').length },
      { Section: '👥 STUDENTS', Item: 'Students Not In Any Group', Details: students.filter(s => !s.groupId).length },
      { Section: '📝 REVIEW', Item: 'Ideas Pending Teacher Review', Details: ideas.filter(i => !(i.rating > 0) && !i.teacherReply).length }
    );
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(overviewRows), '📊 Overview');

    const problemRows = visibleProblems.map((p, idx) => {
      const pIdeas = ideas.filter(i => i.problemId === p.id);
      const pClusters = clusteredIdeasByProblem[p.id] || [];
      return {
        '#': idx + 1,
        'Problem ID': p.id,
        'Title': p.title,
        'Description': p.description || '—',
        'Created Time': p.createdTime || '—',
        'Deadline': p.deadline ? new Date(p.deadline).toLocaleString() : 'No Deadline',
        'Students Can See Each Other': p.peerResponsesVisible !== false ? 'Yes 👁️' : 'No 🔒',
        'Shared With All Teachers': p.sharedWithTeachers ? 'Yes 🌍' : 'No 🔒',
        'Total Ideas': pIdeas.length,
        'Total Clusters': pClusters.length,
        'Similar Clusters': pClusters.filter(c => c.items.length >= 2).length,
        'Total Questions': problemComments.filter(pc => pc.problemId === p.id).length,
        'Total Task Assignments': developments.filter(d => pIdeas.some(i => i.id === d.ideaId)).length,
        'Posted By': p.teacherName || 'Teacher',
        'Teacher UID': p.teacherId || '—',
        'You Are Owner': isProblemOwner(p) ? 'Yes 👑' : 'No (View only)'
      };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(problemRows.length ? problemRows : [{ Info: 'No problems yet' }]), '🎯 Problems');

    const groupRows = groups.map((g, idx) => {
      const members = students.filter(s => s.groupId === g.id);
      const gIdeas = ideas.filter(i => i.groupId === g.id);
      const topIdea = [...gIdeas].sort((a, b) => (b.votes + b.rating * 2) - (a.votes + a.rating * 2))[0];
      return {
        '#': idx + 1,
        'Group ID': g.id,
        'Group Name': g.name,
        'Member Count': members.length,
        'Member Names': members.map(m => m.name).join(', ') || '—',
        'Ideas Posted': gIdeas.length,
        'Total Votes Received': gIdeas.reduce((s, i) => s + (i.votes || 0), 0),
        'Top Idea': topIdea ? topIdea.content : '—',
        'Top Idea By': topIdea ? topIdea.studentName : '—',
        'Top Idea Rating': topIdea ? (topIdea.rating || 0) : 0
      };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(groupRows.length ? groupRows : [{ Info: 'No groups yet' }]), '👥 Groups');

    const studentRows = students.map(s => {
      const own = ideas.filter(i => i.studentId === s.id);
      const avgR = own.length ? (own.reduce((sum, i) => sum + (i.rating || 0), 0) / own.length).toFixed(2) : '0.00';
      const highRated = own.filter(i => i.rating >= 4 || i.badge).length;
      const grp = groups.find(g => g.id === s.groupId);
      const ownQuestions = problemComments.filter(pc => pc.studentId === s.id).length;
      const ownReplies = problemComments.reduce((sum, pc) => sum + (pc.studentReplies || []).filter(sr => sr.studentId === s.id).length, 0);
      const ownComments = ideas.reduce((sum, i) => sum + (i.ideaComments || []).filter(c => c.studentId === s.id).length, 0);
      const ownVotesReceived = own.reduce((sum, i) => sum + (i.votes || 0), 0);
      const assignedTasks = developments.filter(d => own.some(i => i.id === d.ideaId)).length;
      const taskStages = own.map(o => developments.find(d => d.ideaId === o.id)?.stage).filter(Boolean);
      return {
        'Student ID': s.id,
        'Name': s.name,
        'Email': s.email || '—',
        'Avatar': s.avatar || '🎓',
        'Group': grp?.name || 'Unassigned',
        'Ideas Posted': s.ideasCount || 0,
        'High-Rated Ideas (4★+)': highRated,
        'Badged Ideas': own.filter(i => i.badge).length,
        'Avg Idea Rating': avgR,
        'Votes Received': ownVotesReceived,
        'Upvotes Given': s.upvotesGiven || 0,
        'Questions Asked': ownQuestions,
        'Replies to Questions': ownReplies,
        'Idea Comments': ownComments,
        'Total Comments (all)': s.commentsCount || 0,
        'Problems Attempted': s.problemsAttempted || 0,
        'Attempted Problem IDs': (s.attemptedProblems || []).join(', ') || '—',
        'Streak (Days)': s.streak || 0,
        'Last Active Date': s.lastActiveDate || '—',
        'Last Active': s.lastActive || 'N/A',
        'Assigned Tasks': assignedTasks,
        'Task Stages Held': taskStages.length ? [...new Set(taskStages)].map(stageLabel).join(', ') : '—'
      };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(studentRows.length ? studentRows : [{ Info: 'No students yet' }]), '🧑‍🎓 Students');

    const summaryRows = students.map((s, idx) => {
      const own = ideas.filter(i => i.studentId === s.id);
      const grp = groups.find(g => g.id === s.groupId);
      const leaderScore = leaderboardData.find(l => l.id === s.id)?.score || 0;
      const partStatus = participationData.find(p => p.id === s.id);
      const ownQuestions = problemComments.filter(pc => pc.studentId === s.id).length;
      const ownReplies = problemComments.reduce((sum, pc) => sum + (pc.studentReplies || []).filter(sr => sr.studentId === s.id).length, 0);
      const ownComments = ideas.reduce((sum, i) => sum + (i.ideaComments || []).filter(c => c.studentId === s.id).length, 0);
      const votesReceived = own.reduce((sum, i) => sum + (i.votes || 0), 0);
      const tasksHeld = developments.filter(d => own.some(i => i.id === d.ideaId)).length;
      const problemsSolved = new Set(own.map(i => i.problemId)).size;
      const totalActivity = (s.ideasCount || 0) + (s.commentsCount || 0) + (s.upvotesGiven || 0);
      return {
        '#': idx + 1,
        'Student': s.name,
        'Group': grp?.name || 'Unassigned',
        'Streak (Days)': s.streak || 0,
        'Ideas': s.ideasCount || 0,
        'High-Rated': own.filter(i => i.rating >= 4 || i.badge).length,
        'Badges': own.filter(i => i.badge).length,
        'Votes Received': votesReceived,
        'Upvotes Given': s.upvotesGiven || 0,
        'Questions': ownQuestions,
        'Replies': ownReplies,
        'Idea Comments': ownComments,
        'Problems Attempted': problemsSolved,
        'Assigned Tasks': tasksHeld,
        'Total Activity': totalActivity,
        'Leaderboard Score': leaderScore,
        'Rank': leaderboardData.findIndex(l => l.id === s.id) + 1,
        'Participation Status': partStatus ? `${partStatus.status.emoji} ${partStatus.status.label}` : '—',
        'Last Active': s.lastActive || 'N/A'
      };
    }).sort((a, b) => b['Leaderboard Score'] - a['Leaderboard Score']);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows.length ? summaryRows : [{ Info: 'No students yet' }]), '🏅 Student Summary');

    const ideaRows = ideas.map((i, idx) => {
      const prob = problems.find(p => p.id === i.problemId);
      const dev = developments.find(d => d.ideaId === i.id);
      const simInfo = clusterSimilarityMap[i.id];
      const simNames = simInfo?.similarTo?.map(x => `${x.name} (${Math.round(x.sim * 100)}%)`).join('; ') || '—';
      return {
        '#': idx + 1,
        'Idea ID': i.id,
        'Problem': prob?.title || i.problemId,
        'Problem Owner Teacher': prob?.teacherName || '—',
        'Student': i.studentName,
        'Student ID': i.studentId,
        'Group': i.groupName || '—',
        'Content': i.content,
        'Tag': i.tag || '—',
        'Votes': i.votes || 0,
        'Rating (1-5)': i.rating || 0,
        'Badge': i.badge || '—',
        'Visible to Students': i.visibleToStudents === false ? 'No 🙈' : 'Yes 👁️',
        'Teacher Only': i.teacherOnly ? 'Yes 🔒' : 'No 🌐',
        'Teacher Feedback': i.teacherReply || '—',
        'Comments on Idea': (i.ideaComments || []).length,
        'Similar To': simNames,
        'Task Stage': dev ? stageLabel(dev.stage) : '—',
        'Task Note': dev?.note || '—',
        'Task Deadline': dev?.deadline ? new Date(dev.deadline).toLocaleString() : '—',
        'Task Group': dev?.groupName || '—',
        'Task Visibility': dev ? (dev.visibleToOthers === false ? 'Private 🔒' : 'Team 👁️') : '—'
      };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(ideaRows.length ? ideaRows : [{ Info: 'No ideas yet' }]), '💡 Ideas');

    const taskRows = developments.map((d, idx) => {
      const idea = ideas.find(i => i.id === d.ideaId);
      const stageObj = DEVELOPMENT_STAGES.find(s => s.key === d.stage);
      const groupObj = groups.find(g => g.id === d.groupId);
      return {
        '#': idx + 1,
        'Task ID': d.id,
        'Idea Owner': idea?.studentName || '—',
        'Idea Owner ID': idea?.studentId || '—',
        'Idea Content': idea?.content || '—',
        'Problem': idea ? (problems.find(p => p.id === idea.problemId)?.title || idea.problemId) : '—',
        'Assigned Group': d.groupName || '—',
        'Group Member Count': groupObj?.members?.length || 0,
        'Group Members': groupObj ? groupObj.members.map(m => students.find(s => s.id === m)?.name || m).join(', ') : '—',
        'Stage (key)': d.stage || '—',
        'Stage (label)': stageObj ? `${stageObj.emoji} ${stageObj.label}` : '—',
        'Next Step': d.note || '—',
        'Deadline': d.deadline ? new Date(d.deadline).toLocaleString() : '—',
        'Visible to Others': d.visibleToOthers === false ? 'No 🔒' : 'Yes 👁️',
        'Created At': d.createdAt || '—',
        'Updated At': d.updatedAt || '—'
      };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(taskRows.length ? taskRows : [{ Info: 'No tasks yet' }]), '🚀 Tasks');

    const studentTaskRows = [];
    students.forEach(st => {
      const ownIdeas = ideas.filter(i => i.studentId === st.id);
      const ownTasks = developments.filter(d => ownIdeas.some(i => i.id === d.ideaId));
      const groupTasks = developments.filter(d => st.groupId && d.groupId === st.groupId && !ownTasks.some(t => t.id === d.id));
      ownTasks.forEach(d => {
        const idea = ideas.find(i => i.id === d.ideaId);
        const stageObj = DEVELOPMENT_STAGES.find(s => s.key === d.stage);
        studentTaskRows.push({
          'Student': st.name, 'Student ID': st.id,
          'Group': groups.find(g => g.id === st.groupId)?.name || 'Unassigned',
          'Role': '👑 Owner', 'Task ID': d.id,
          'Idea Content': idea?.content || '—',
          'Assigned Group': d.groupName || '—',
          'Stage': stageObj ? `${stageObj.emoji} ${stageObj.label}` : '—',
          'Next Step': d.note || '—',
          'Deadline': d.deadline ? new Date(d.deadline).toLocaleString() : '—',
          'Visible to Others': d.visibleToOthers === false ? 'Private 🔒' : 'Team 👁️'
        });
      });
      groupTasks.forEach(d => {
        const idea = ideas.find(i => i.id === d.ideaId);
        const stageObj = DEVELOPMENT_STAGES.find(s => s.key === d.stage);
        studentTaskRows.push({
          'Student': st.name, 'Student ID': st.id,
          'Group': groups.find(g => g.id === st.groupId)?.name || 'Unassigned',
          'Role': '👥 Team Member', 'Task ID': d.id,
          'Idea Content': idea?.content || '—',
          'Assigned Group': d.groupName || '—',
          'Stage': stageObj ? `${stageObj.emoji} ${stageObj.label}` : '—',
          'Next Step': d.note || '—',
          'Deadline': d.deadline ? new Date(d.deadline).toLocaleString() : '—',
          'Visible to Others': d.visibleToOthers === false ? 'Private 🔒' : 'Team 👁️'
        });
      });
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(studentTaskRows.length ? studentTaskRows : [{ Info: 'No student tasks yet' }]), '📋 Student Tasks');

    const matrixRows = [];
    students.forEach(st => {
      visibleProblems.forEach(prob => {
        const stuIdeas = ideas.filter(i => i.studentId === st.id && i.problemId === prob.id);
        const stuQuestions = problemComments.filter(pc => pc.studentId === st.id && pc.problemId === prob.id);
        const stuIdeaComments = stuIdeas.reduce((sum, i) => sum + (i.ideaComments || []).filter(c => c.studentId === st.id).length, 0);
        const stuVotesReceived = stuIdeas.reduce((sum, i) => sum + (i.votes || 0), 0);
        const stuRated = stuIdeas.filter(i => i.rating > 0);
        const avgR = stuRated.length ? (stuRated.reduce((s, i) => s + i.rating, 0) / stuRated.length).toFixed(2) : '—';
        const taskStages = stuIdeas.map(i => developments.find(d => d.ideaId === i.id)?.stage).filter(Boolean);
        const participated = stuIdeas.length > 0 || stuQuestions.length > 0;
        matrixRows.push({
          'Student': st.name, 'Student ID': st.id,
          'Group': groups.find(g => g.id === st.groupId)?.name || 'Unassigned',
          'Problem': prob.title, 'Problem ID': prob.id,
          'Ideas Posted': stuIdeas.length,
          'Votes Received': stuVotesReceived,
          'Ideas Rated': stuRated.length,
          'Avg Rating': avgR,
          'Badges Earned': stuIdeas.filter(i => i.badge).length,
          'Questions Asked': stuQuestions.length,
          'Comments Made': stuIdeaComments,
          'Task Stages': taskStages.length ? [...new Set(taskStages)].map(stageLabel).join(', ') : '—',
          'Participated?': participated ? '✅ Yes' : '❌ No'
        });
      });
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(matrixRows.length ? matrixRows : [{ Info: 'No data yet' }]), '🎯 Perf Matrix');

    const problemCommentRows = [];
    problemComments.forEach(pc => {
      const prob = problems.find(p => p.id === pc.problemId);
      problemCommentRows.push({
        'Type': '❓ Question', 'Question ID': pc.id,
        'Problem': prob?.title || pc.problemId,
        'Student': pc.studentName, 'Student ID': pc.studentId,
        'Text': pc.text, 'Time': pc.time,
        'Teacher Reply': pc.teacherReply || '—',
        'Replies Count': (pc.studentReplies || []).length
      });
      (pc.studentReplies || []).forEach(sr => {
        problemCommentRows.push({
          'Type': '↩️ Reply', 'Question ID': pc.id,
          'Problem': prob?.title || pc.problemId,
          'Student': sr.studentName, 'Student ID': sr.studentId,
          'Text': sr.text, 'Time': sr.time,
          'Teacher Reply': '—', 'Replies Count': '—'
        });
      });
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(problemCommentRows.length ? problemCommentRows : [{ Info: 'No problem comments yet' }]), '❓ Problem Comments');

    const ideaCommentRows = [];
    ideas.forEach(idea => {
      const prob = problems.find(p => p.id === idea.problemId);
      (idea.ideaComments || []).forEach(c => {
        ideaCommentRows.push({
          'Comment ID': c.id, 'Idea ID': idea.id,
          'Problem': prob?.title || idea.problemId,
          'Idea Owner': idea.studentName,
          'Idea Content': idea.content,
          'Commenter': c.studentName, 'Commenter ID': c.studentId,
          'Comment Text': c.text, 'Time': c.time
        });
      });
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(ideaCommentRows.length ? ideaCommentRows : [{ Info: 'No idea comments yet' }]), '💬 Idea Comments');

    const activityRows = [];
    ideas.forEach(idea => {
      activityRows.push({
        'Student': idea.studentName, 'Student ID': idea.studentId,
        'Action': '💡 Idea Posted', 'Detail': idea.content,
        'Problem': problems.find(p => p.id === idea.problemId)?.title || idea.problemId,
        'Votes': idea.votes || 0, 'Rating': idea.rating || 0, 'Time': idea.createdAt || '—'
      });
    });
    problemComments.forEach(pc => {
      activityRows.push({
        'Student': pc.studentName, 'Student ID': pc.studentId,
        'Action': '❓ Question Asked', 'Detail': pc.text,
        'Problem': problems.find(p => p.id === pc.problemId)?.title || pc.problemId,
        'Votes': '—', 'Rating': '—', 'Time': pc.time
      });
      (pc.studentReplies || []).forEach(sr => {
        activityRows.push({
          'Student': sr.studentName, 'Student ID': sr.studentId,
          'Action': '↩️ Replied to Question', 'Detail': sr.text,
          'Problem': problems.find(p => p.id === pc.problemId)?.title || pc.problemId,
          'Votes': '—', 'Rating': '—', 'Time': sr.time
        });
      });
    });
    ideas.forEach(idea => {
      (idea.ideaComments || []).forEach(c => {
        activityRows.push({
          'Student': c.studentName, 'Student ID': c.studentId,
          'Action': '💬 Commented on Idea', 'Detail': c.text,
          'Problem': problems.find(p => p.id === idea.problemId)?.title || idea.problemId,
          'Votes': '—', 'Rating': '—', 'Time': c.time
        });
      });
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(activityRows.length ? activityRows : [{ Info: 'No student activity yet' }]), '📊 Activity Log');

    const leaderboardRows = leaderboardData.map((st, idx) => ({
      'Rank': idx + 1, 'Student': st.name, 'Student ID': st.id,
      'Group': groups.find(g => g.id === st.groupId)?.name || 'Unassigned',
      'Score': st.score, 'Streak (Days)': st.streak || 0,
      'Ideas Posted': st.ideasCount || 0,
      'High-Rated Ideas': st.highRatedIdeas,
      'Upvotes Given': st.upvotesGiven || 0,
      'Last Active': st.lastActive || 'N/A'
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(leaderboardRows.length ? leaderboardRows : [{ Info: 'No students yet' }]), '🏆 Leaderboard');

    const participationRows = participationData.map(st => ({
      'Student': st.name, 'Student ID': st.id,
      'Group': groups.find(g => g.id === st.groupId)?.name || 'Unassigned',
      'Status': `${st.status.emoji} ${st.status.label}`,
      'Note': st.status.note,
      'Participation Score': st.pScore,
      'Ideas': st.ideasCount || 0,
      'Comments': st.commentsCount || 0,
      'Upvotes Given': st.upvotesGiven || 0,
      'Problems Attempted': st.problemsAttempted || 0,
      'Streak (Days)': st.streak || 0,
      'Last Active': st.lastActive || 'N/A'
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(participationRows.length ? participationRows : [{ Info: 'No students yet' }]), '📈 Participation');

    const announcementRows = announcements.map((a, idx) => ({
      '#': idx + 1, 'Title': a.title, 'Content': a.content, 'Time': a.time || '—'
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(announcementRows.length ? announcementRows : [{ Info: 'No announcements yet' }]), '📢 Announcements');

    const topScore = Math.max(0, ...leaderboardData.map(l => l.score || 0));
    const gradeOf = (score, hasActivity = false) => {
      if (!topScore || !score || score <= 0) return hasActivity ? 'E – Poor (discussion only, no ideas)' : 'F – No Participation';
      const pct = (score / topScore) * 100;
      if (pct >= 80) return 'A – Excellent';
      if (pct >= 60) return 'B – Good';
      if (pct >= 40) return 'C – Average';
      if (pct >= 20) return 'D – Needs Improvement';
      return 'E – Poor';
    };

    const reportCardRows = leaderboardData.map((st, idx) => {
      const grp = groups.find(g => g.id === st.groupId);
      const own = ideas.filter(i => i.studentId === st.id);
      const ratedOwn = own.filter(i => i.rating > 0);
      const avgR = ratedOwn.length ? (ratedOwn.reduce((s, i) => s + i.rating, 0) / ratedOwn.length).toFixed(2) : '—';
      const qs = problemComments.filter(pc => pc.studentId === st.id);
      const replies = problemComments.reduce((sum, pc) => sum + (pc.studentReplies || []).filter(sr => sr.studentId === st.id).length, 0);
      const ideaCmts = ideas.reduce((sum, i) => sum + (i.ideaComments || []).filter(c => c.studentId === st.id).length, 0);
      const attempted = visibleProblems.filter(p => own.some(i => i.problemId === p.id) || qs.some(q => q.problemId === p.id));
      const notAttempted = visibleProblems.filter(p => !attempted.some(a => a.id === p.id));

      const ownTasks = developments.filter(d => own.some(i => i.id === d.ideaId));
      const groupTasks = developments.filter(d => st.groupId && d.groupId === st.groupId && !ownTasks.some(t => t.id === d.id));
      const classTasks = developments.filter(d => !d.groupId && !ownTasks.some(t => t.id === d.id));
      const allTasks = [...ownTasks, ...groupTasks, ...classTasks];
      const statuses = allTasks.map(taskStatusOf);
      const completed = statuses.filter(s => s.key === 'done').length;
      const overdue = statuses.filter(s => s.key === 'overdue').length;
      const nextDue = allTasks
        .filter(d => d.stage !== 'implemented' && d.deadline && !isNaN(new Date(d.deadline).getTime()) && new Date(d.deadline).getTime() >= nowMs)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0];
      const part = participationData.find(p => p.id === st.id);

      const flags = [];
      if (!own.length && !qs.length) flags.push('Nothing posted yet');
      if (visibleProblems.length && notAttempted.length) flags.push(`${notAttempted.length} problem(s) not attempted`);
      if (overdue) flags.push(`${overdue} overdue task(s)`);
      if (!st.groupId) flags.push('Not in any group');
      if (own.length && ratedOwn.length && Number(avgR) < 2.5) flags.push('Low idea rating');

      return {
        'Rank': idx + 1,
        'Student': st.name,
        'Student ID': st.id,
        'Email': st.email || '—',
        'Group': grp?.name || 'Unassigned',
        'Performance Grade': gradeOf(st.score, (own.length + qs.length + replies + ideaCmts) > 0),
        'Score': st.score || 0,
        'Score % of Top': topScore ? `${Math.round(((st.score || 0) / topScore) * 100)}%` : '0%',
        'Participation Status': part ? `${part.status.emoji} ${part.status.label}` : '—',
        'Ideas Posted': own.length,
        'Avg Idea Rating': avgR,
        'High-Rated Ideas (4★+)': own.filter(i => i.rating >= 4 || i.badge).length,
        'Badges Earned': own.filter(i => i.badge).length,
        'Votes Received': own.reduce((s, i) => s + (i.votes || 0), 0),
        'Upvotes Given': st.upvotesGiven || 0,
        'Questions Asked': qs.length,
        'Replies to Classmates': replies,
        'Comments on Ideas': ideaCmts,
        'Problems Attempted': `${attempted.length} / ${visibleProblems.length}`,
        'Problems NOT Attempted': notAttempted.length ? notAttempted.map(p => p.title).join(' | ') : '—',
        'Total Tasks Assigned': allTasks.length,
        'Tasks As Idea Owner': ownTasks.length,
        'Tasks Via Group': groupTasks.length,
        'Whole-Class Tasks': classTasks.length,
        'Tasks Completed': completed,
        'Tasks In Progress': allTasks.length - completed,
        'Tasks Overdue': overdue,
        'Next Task Deadline': nextDue ? new Date(nextDue.deadline).toLocaleString() : '—',
        'Streak (Days)': st.streak || 0,
        'Last Active': st.lastActive || 'N/A',
        'Needs Attention?': flags.length ? `⚠️ ${flags.join('; ')}` : '✅ All good'
      };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportCardRows.length ? reportCardRows : [{ Info: 'No students yet' }]), '🎓 Report Card');

    const statusOrder = { overdue: 0, soon: 1, ontrack: 2, nodeadline: 3, done: 4 };
    const trackerRows = [...developments]
      .sort((a, b) => statusOrder[taskStatusOf(a).key] - statusOrder[taskStatusOf(b).key])
      .map((d, idx) => {
        const idea = ideas.find(i => i.id === d.ideaId);
        const grpObj = groups.find(g => g.id === d.groupId);
        const st = taskStatusOf(d);
        const stageObj = DEVELOPMENT_STAGES.find(s => s.key === d.stage);
        let responsible = '—';
        if (d.groupId && grpObj) {
          const names = (grpObj.members || []).map(m => students.find(s => s.id === m)?.name || m);
          if (idea?.studentName && !names.includes(idea.studentName)) names.unshift(idea.studentName);
          responsible = names.join(', ') || '—';
        } else if (!d.groupId) {
          responsible = `Whole Class${idea?.studentName ? ` (idea by ${idea.studentName})` : ''}`;
        }
        return {
          '#': idx + 1,
          'Status': st.label,
          'Days Left (− = overdue)': st.daysLeft,
          'Task (Idea)': idea?.content || '—',
          'Problem': idea ? (problems.find(p => p.id === idea.problemId)?.title || idea.problemId) : '—',
          'Idea Owner': idea?.studentName || '—',
          'Assigned Group': d.groupName || 'Whole Class',
          'Responsible Students': responsible,
          'Current Stage': stageObj ? `${stageObj.emoji} ${stageObj.label}` : '—',
          'Progress %': `${stageProgressPct(d.stage)}%`,
          'Instructions / Next Step': d.note || '—',
          'Deadline': d.deadline ? new Date(d.deadline).toLocaleString() : '—',
          'Assigned On': d.createdAt || '—',
          'Last Updated': d.updatedAt || '—'
        };
      });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(trackerRows.length ? trackerRows : [{ Info: 'No tasks yet' }]), '⏰ Task Tracker');

    const contributionRows = [];
    const groupBuckets = groups.map(g => ({ id: g.id, name: g.name, members: students.filter(s => s.groupId === g.id) }));
    const unassignedStudents = students.filter(s => !s.groupId || !groups.some(g => g.id === s.groupId));
    if (unassignedStudents.length) groupBuckets.push({ id: '', name: 'Unassigned', members: unassignedStudents });
    groupBuckets.forEach(gb => {
      if (gb.members.length === 0) {
        contributionRows.push({ 'Group': gb.name, 'Member': '— (no members)', 'Contribution Level': '—' });
        return;
      }
      const stats = gb.members.map(m => {
        const own = ideas.filter(i => i.studentId === m.id);
        const ratedOwn = own.filter(i => i.rating > 0);
        const qs = problemComments.filter(pc => pc.studentId === m.id).length;
        const reps = problemComments.reduce((sum, pc) => sum + (pc.studentReplies || []).filter(sr => sr.studentId === m.id).length, 0);
        const cmts = ideas.reduce((sum, i) => sum + (i.ideaComments || []).filter(c => c.studentId === m.id).length, 0);
        return {
          m, own, qs, reps, cmts,
          avgR: ratedOwn.length ? (ratedOwn.reduce((s, i) => s + i.rating, 0) / ratedOwn.length).toFixed(2) : '—',
          activity: own.length + qs + reps + cmts,
          tasksOwned: developments.filter(d => own.some(i => i.id === d.ideaId)).length
        };
      });
      const groupActivity = stats.reduce((s, x) => s + x.activity, 0);
      const groupIdeas = stats.reduce((s, x) => s + x.own.length, 0);
      const fairShare = 1 / stats.length;
      stats.sort((a, b) => b.activity - a.activity).forEach(x => {
        const share = groupActivity ? x.activity / groupActivity : 0;
        let level = '🌟 Strong Contributor';
        if (x.activity === 0) level = '🚫 No Contribution';
        else if (share < fairShare * 0.6) level = '🟡 Below Fair Share';
        else if (share < fairShare) level = '🔵 Slightly Below Average';
        contributionRows.push({
          'Group': gb.name,
          'Member': x.m.name,
          'Student ID': x.m.id,
          'Ideas Posted': x.own.length,
          'Share of Group Ideas': groupIdeas ? `${Math.round((x.own.length / groupIdeas) * 100)}%` : '0%',
          'Questions Asked': x.qs,
          'Replies Given': x.reps,
          'Idea Comments': x.cmts,
          'Total Activity': x.activity,
          'Share of Group Activity': `${Math.round(share * 100)}%`,
          'Votes Received': x.own.reduce((s, i) => s + (i.votes || 0), 0),
          'Avg Idea Rating': x.avgR,
          'Badges': x.own.filter(i => i.badge).length,
          'Tasks Owned': x.tasksOwned,
          'Contribution Level': level
        });
      });
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(contributionRows.length ? contributionRows : [{ Info: 'No groups yet' }]), '🤝 Group Contribution');

    const problemParticipationRows = visibleProblems.map((p, idx) => {
      const pIdeas = ideas.filter(i => i.problemId === p.id);
      const pQs = problemComments.filter(pc => pc.problemId === p.id);
      const participantIds = new Set([...pIdeas.map(i => i.studentId), ...pQs.map(q => q.studentId)]);
      const participants = students.filter(s => participantIds.has(s.id));
      const nonParticipants = students.filter(s => !participantIds.has(s.id));
      const rated = pIdeas.filter(i => i.rating > 0);
      const top = [...pIdeas].sort((a, b) => (b.votes + b.rating * 2) - (a.votes + a.rating * 2))[0];
      const pTasks = developments.filter(d => pIdeas.some(i => i.id === d.ideaId));
      const deadlineMs = p.deadline ? new Date(p.deadline).getTime() : NaN;
      return {
        '#': idx + 1,
        'Problem': p.title,
        'Owner Teacher': p.teacherName || '—',
        'Shared With All Teachers': p.sharedWithTeachers ? 'Yes 🌍' : 'No 🔒',
        'Deadline': p.deadline ? new Date(p.deadline).toLocaleString() : 'No Deadline',
        'Problem Status': isNaN(deadlineMs) ? '🟢 Open (no deadline)' : (deadlineMs < nowMs ? '🔒 Closed (deadline passed)' : '🟢 Open'),
        'Total Students': students.length,
        'Students Who Participated': participants.length,
        'Students Who Did NOT': nonParticipants.length,
        'Participation %': students.length ? `${Math.round((participants.length / students.length) * 100)}%` : '0%',
        'Participants': participants.map(s => s.name).join(', ') || '—',
        'Non-Participants': nonParticipants.map(s => s.name).join(', ') || '—',
        'Ideas Posted': pIdeas.length,
        'Questions Asked': pQs.length,
        'Avg Idea Rating': rated.length ? (rated.reduce((s, i) => s + i.rating, 0) / rated.length).toFixed(2) : '—',
        'Top Idea': top ? top.content : '—',
        'Top Idea By': top ? top.studentName : '—',
        'Tasks Assigned': pTasks.length,
        'Tasks Completed': pTasks.filter(d => d.stage === 'implemented').length,
        'Tasks Overdue': pTasks.filter(d => taskStatusOf(d).key === 'overdue').length
      };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(problemParticipationRows.length ? problemParticipationRows : [{ Info: 'No problems yet' }]), '📌 Problem Participation');

    const reviewOrder = { '⏳ Pending Review': 0, '🟡 Partially Reviewed': 1, '✅ Fully Reviewed': 2 };
    const reviewRows = ideas.map(i => {
      const hasRating = i.rating > 0;
      const hasFeedback = !!(i.teacherReply && String(i.teacherReply).trim());
      const status = hasRating && hasFeedback ? '✅ Fully Reviewed' : (hasRating || hasFeedback ? '🟡 Partially Reviewed' : '⏳ Pending Review');
      return {
        'Review Status': status,
        'Student': i.studentName,
        'Group': i.groupName || '—',
        'Problem': problems.find(p => p.id === i.problemId)?.title || i.problemId,
        'Idea': i.content,
        'Rated?': hasRating ? `Yes (${i.rating}/5)` : 'No',
        'Feedback Given?': hasFeedback ? 'Yes' : 'No',
        'Teacher Feedback': hasFeedback ? i.teacherReply : '—',
        'Badge': i.badge || '—',
        'Task Assigned?': developments.some(d => d.ideaId === i.id) ? 'Yes 🚀' : 'No',
        'Posted At': i.createdAt || '—'
      };
    }).sort((a, b) => reviewOrder[a['Review Status']] - reviewOrder[b['Review Status']]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reviewRows.length ? reviewRows : [{ Info: 'No ideas yet' }]), '📝 Review Status');

    const SCHED_NAME = '📅 Master Schedule';
    const SCHED_COLS = 13;
    const schedAoa = [];
    const schedMerges = [];
    const schedBanner = (text) => {
      schedMerges.push({ s: { r: schedAoa.length, c: 0 }, e: { r: schedAoa.length, c: SCHED_COLS - 1 } });
      schedAoa.push([text]);
    };
    const schedBlank = () => schedAoa.push([]);
    const trunc = (t, n = 45) => { const s = String(t || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
    const devCols = (dev) => dev
      ? [dev.note || '—', stageLabel(dev.stage), dev.deadline ? new Date(dev.deadline).toLocaleString() : '—', taskStatusOf(dev).label]
      : ['—', '—', '—', '—'];

    const doneTasksN = developments.filter(d => taskStatusOf(d).key === 'done').length;
    const overdueTasksN = developments.filter(d => taskStatusOf(d).key === 'overdue').length;
    const pendingReviewN = ideas.filter(i => !(i.rating > 0) && !i.teacherReply).length;
    schedBanner('📅 CLASS MASTER SCHEDULE — COMPLETE TEACHER REPORT');
    schedBanner(`Generated: ${generatedAt}   |   Teacher: ${currentUser?.name || 'Teacher'}`);
    schedBlank();
    schedBanner('📊 CLASS SNAPSHOT');
    schedBanner(`Groups: ${groups.length}   |   Students: ${students.length}   |   Problems: ${visibleProblems.length}   |   Ideas: ${ideas.length}   |   Tasks assigned: ${developments.length} (✅ ${doneTasksN} completed, 🔴 ${overdueTasksN} overdue)   |   Ideas pending your review: ${pendingReviewN}`);
    schedBlank();
    schedBanner('🏆 TOP PERFORMERS');
    const topPerformers = reportCardRows.filter(r => r['Score'] > 0).slice(0, 3);
    if (topPerformers.length) {
      topPerformers.forEach((r, i) => schedBanner(`${i + 1}. ${r['Student']} (${r['Group']}) — ${r['Performance Grade']} — ${r['Ideas Posted']} ideas, avg rating ${r['Avg Idea Rating']}, tasks done ${r['Tasks Completed']}/${r['Total Tasks Assigned']}`));
    } else {
      schedBanner('No student participation yet.');
    }
    schedBlank();
    schedBanner('⚠️ NEEDS ATTENTION');
    const needAttn = reportCardRows.filter(r => r['Needs Attention?'] !== '✅ All good');
    if (needAttn.length) {
      needAttn.slice(0, 20).forEach(r => schedBanner(`${r['Student']} (${r['Group']}) — ${String(r['Needs Attention?']).replace('⚠️ ', '')}`));
      if (needAttn.length > 20) schedBanner(`… and ${needAttn.length - 20} more (see 🎓 Report Card sheet)`);
    } else {
      schedBanner('✅ Everyone is on track.');
    }
    schedBlank();
    schedBanner('🎯 PROBLEMS DISCUSSED');
    if (problemParticipationRows.length) {
      problemParticipationRows.forEach((r, i) => schedBanner(`${i + 1}. ${r['Problem']}   |   Owner: ${r['Owner Teacher']}   |   Shared: ${r['Shared With All Teachers']}   |   Deadline: ${r['Deadline']}   |   ${r['Ideas Posted']} ideas, ${r['Questions Asked']} questions   |   Participated: ${r['Students Who Participated']}/${r['Total Students']} students   |   Tasks: ${r['Tasks Assigned']}`));
    } else {
      schedBanner('No problems posted yet.');
    }
    schedBlank();
    schedBanner('👥 GROUPS & MEMBERS');
    if (groupBuckets.length) {
      groupBuckets.forEach(gb => {
        const gIdeasN = ideas.filter(i => gb.members.some(m => m.id === i.studentId)).length;
        const gTasksN = gb.id ? developments.filter(d => d.groupId === gb.id).length : 0;
        schedBanner(`${gb.name} — ${gb.members.length} member(s): ${gb.members.map(m => m.name).join(', ') || '—'}   |   ${gIdeasN} ideas   |   ${gTasksN} task(s) assigned to group`);
      });
    } else {
      schedBanner('No groups yet.');
    }
    schedBlank();
    schedBanner('📋 DETAILED SCHEDULE  (Group → Student → Problem → Activity → Teacher Remarks → Task)');
    schedAoa.push(['Group', 'Student', 'Problem', 'Activity', 'Time', 'Discussion / What the student did', 'Rating', 'Badge', 'Teacher Remarks', 'Task Assigned by Teacher', 'Task Stage', 'Task Deadline', 'Task Status']);

    groupBuckets.forEach(gb => {
      schedBlank();
      schedBanner(`👥 GROUP: ${gb.name.toUpperCase()}   —   ${gb.members.length} member(s): ${gb.members.map(m => m.name).join(', ') || '—'}`);
      gb.members.forEach(st => {
        const rc = reportCardRows.find(r => r['Student ID'] === st.id) || {};
        const notAtt = rc['Problems NOT Attempted'] && rc['Problems NOT Attempted'] !== '—' ? `   |   Not attempted: ${rc['Problems NOT Attempted']}` : '';
        schedBanner(`      🧑‍🎓 ${st.name}   |   Rank #${rc['Rank'] || '—'}   |   ${rc['Performance Grade'] || '—'}   |   ${rc['Participation Status'] || '—'}   |   Ideas: ${rc['Ideas Posted'] || 0} (avg ${rc['Avg Idea Rating'] || '—'})   |   Tasks done: ${rc['Tasks Completed'] || 0}/${rc['Total Tasks Assigned'] || 0}, overdue: ${rc['Tasks Overdue'] || 0}${notAtt}`);

        const rows = [];
        const myIdeas = ideas.filter(i => i.studentId === st.id);
        const ownTaskIds = new Set(developments.filter(d => myIdeas.some(i => i.id === d.ideaId)).map(d => d.id));

        visibleProblems.forEach(prob => {
          myIdeas.filter(i => i.problemId === prob.id).forEach(i => {
            const dev = developments.find(d => d.ideaId === i.id);
            const fb = i.teacherReply && String(i.teacherReply).trim() ? i.teacherReply : '— (no feedback yet)';
            rows.push([gb.name, st.name, prob.title, '💡 Idea', i.createdAt || '—', i.content, i.rating > 0 ? `${i.rating}/5` : 'Not rated', i.badge || '—', fb, ...devCols(dev)]);
          });
          problemComments.filter(pc => pc.problemId === prob.id && pc.studentId === st.id).forEach(pc => {
            rows.push([gb.name, st.name, prob.title, '❓ Question', pc.time || '—', pc.text, '—', '—', pc.teacherReply || '— (not answered yet)', '—', '—', '—', '—']);
          });
          problemComments.filter(pc => pc.problemId === prob.id).forEach(pc => {
            (pc.studentReplies || []).filter(sr => sr.studentId === st.id).forEach(sr => {
              rows.push([gb.name, st.name, prob.title, '↩️ Reply', sr.time || '—', `Re "${trunc(pc.text)}": ${sr.text}`, '—', '—', '—', '—', '—', '—', '—']);
            });
          });
          ideas.filter(i => i.problemId === prob.id).forEach(i => {
            (i.ideaComments || []).filter(c => c.studentId === st.id).forEach(c => {
              rows.push([gb.name, st.name, prob.title, '💬 Comment', c.time || '—', `On ${i.studentName}'s idea "${trunc(i.content)}": ${c.text}`, '—', '—', '—', '—', '—', '—', '—']);
            });
          });
          developments.filter(d => !ownTaskIds.has(d.id) && ((st.groupId && d.groupId === st.groupId) || !d.groupId)).forEach(d => {
            const idea = ideas.find(i => i.id === d.ideaId);
            if (!idea || idea.problemId !== prob.id) return;
            rows.push([gb.name, st.name, prob.title, d.groupId ? '🚀 Group Task' : '🚀 Whole-Class Task', d.createdAt || '—', `Idea by ${idea.studentName}: ${idea.content}`, idea.rating > 0 ? `${idea.rating}/5` : 'Not rated', idea.badge || '—', idea.teacherReply || '—', ...devCols(d)]);
          });
        });

        if (!rows.length) {
          rows.push([gb.name, st.name, '—', '❌ No activity', '—', 'Student has not posted or discussed anything yet.', '—', '—', '—', '—', '—', '—', '—']);
        }
        rows.forEach(r => schedAoa.push(r));
      });
    });

    const schedSheet = XLSX.utils.aoa_to_sheet(schedAoa);
    schedSheet['!merges'] = schedMerges;
    schedSheet['!cols'] = [18, 18, 26, 18, 18, 60, 10, 14, 42, 38, 20, 20, 16].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(workbook, schedSheet, SCHED_NAME);

    const guideRows = [
      { Sheet: '📅 Master Schedule', 'What it tells you': 'START HERE. One timetable-style page: class snapshot, top performers, who needs attention, problems discussed (with owner teacher + sharing status), groups & members, then for every group → student → problem: what they said, teacher remarks/rating, and the task you assigned with deadline & status.' },
      { Sheet: '📊 Overview', 'What it tells you': 'Whole-class totals at a glance (ideas, tasks, overdue work, non-participants, pending reviews).' },
      { Sheet: '🎯 Problems', 'What it tells you': 'Each problem with its deadline, ideas, questions and tasks. Also shows whether it is shared with all teachers.' },
      { Sheet: '👥 Groups', 'What it tells you': 'Each group with members, ideas posted and its best idea.' },
      { Sheet: '🧑‍🎓 Students', 'What it tells you': 'Full raw details for every student.' },
      { Sheet: '🏅 Student Summary', 'What it tells you': 'Compact per-student totals sorted by leaderboard score.' },
      { Sheet: '💡 Ideas', 'What it tells you': 'Every idea with votes, rating, feedback and linked task.' },
      { Sheet: '🚀 Tasks', 'What it tells you': 'Every assigned task with stage, group, note and deadline.' },
      { Sheet: '📋 Student Tasks', 'What it tells you': 'Which student holds which task (owner or team member).' },
      { Sheet: '🎯 Perf Matrix', 'What it tells you': 'Student × Problem grid: who worked on which problem.' },
      { Sheet: '❓ Problem Comments', 'What it tells you': 'All questions, teacher replies and student replies.' },
      { Sheet: '💬 Idea Comments', 'What it tells you': 'All comments written on ideas.' },
      { Sheet: '📊 Activity Log', 'What it tells you': 'Every action performed by students in one list.' },
      { Sheet: '🏆 Leaderboard', 'What it tells you': 'Ranking by score (ideas×10 + high-rated×15 + upvotes given×2 + streak×5).' },
      { Sheet: '📈 Participation', 'What it tells you': 'Participation status of each student (Most Active … No Participation).' },
      { Sheet: '📢 Announcements', 'What it tells you': 'All announcements posted.' },
      { Sheet: '🎓 Report Card', 'What it tells you': 'ONE row per student: grade, ideas, ratings, tasks done/overdue, problems NOT attempted and a "Needs Attention?" flag.' },
      { Sheet: '⏰ Task Tracker', 'What it tells you': 'Every task with status, days left, progress % and responsible students.' },
      { Sheet: '🤝 Group Contribution', 'What it tells you': 'Inside each group: how much each member did and whether someone is not contributing.' },
      { Sheet: '📌 Problem Participation', 'What it tells you': 'For each problem: who participated, who did NOT, participation %, top idea and task progress. Also indicates owner teacher and sharing.' },
      { Sheet: '📝 Review Status', 'What it tells you': 'Which ideas still need your rating/feedback (pending ones are listed first).' },
      { Sheet: '📖 Sheet Guide', 'What it tells you': 'This page.' }
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(guideRows), '📖 Sheet Guide');

    workbook.SheetNames.forEach(name => {
      const ws = workbook.Sheets[name];
      if (!ws || !ws['!ref'] || name === SCHED_NAME) return;
      const range = XLSX.utils.decode_range(ws['!ref']);
      const cols = [];
      for (let C = range.s.c; C <= range.e.c; C++) {
        let max = 8;
        for (let R = range.s.r; R <= range.e.r; R++) {
          const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
          if (cell && cell.v !== undefined && cell.v !== null) {
            const len = String(cell.v).length;
            if (len > max) max = len;
          }
        }
        cols.push({ wch: Math.min(max + 2, 60) });
      }
      ws['!cols'] = cols;
      ws['!autofilter'] = { ref: ws['!ref'] };
    });

    const schedIdx = workbook.SheetNames.indexOf(SCHED_NAME);
    if (schedIdx > 0) { workbook.SheetNames.splice(schedIdx, 1); workbook.SheetNames.unshift(SCHED_NAME); }

    const filename = `ClassBrainstorm_FullReport_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, filename);
    showPopup('⬇️ Full Export Complete', `Downloaded "${filename}" with ${workbook.SheetNames.length} sheets.`, 'info');
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm font-medium">
        Loading…
      </div>
    );
  }
  if (!currentUser) return <Login onLogin={handleLogin} />;

  const displayedIdeas = ideas.filter(i => {
    if (i.problemId !== activeProblem?.id) return false;
    if (role === 'student') {
      if (i.teacherOnly === true && i.studentId !== currentStudentId) return false;
      if (i.visibleToStudents === false && i.studentId !== currentStudentId) return false;
      if (!studentsCanSeeEachOther) return i.studentId === currentStudentId;
      if (viewFilter === 'my-group') return i.groupId === currentGroup?.id;
      return true;
    }
    if (viewFilter === 'my-group') return i.groupId === currentGroup?.id;
    return true;
  });

  const visibleProblemComments = problemComments.filter(pc => {
    if (pc.problemId !== activeProblem?.id) return false;
    if (role === 'student' && !studentsCanSeeEachOther) return pc.studentId === currentStudentId;
    return true;
  });

  if (role === 'student' && !currentStudent && (students.length === 0 || !studentCheckDone)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-semibold">Loading your profile...</p>
        </div>
      </div>
    );
  }

  const queryProblem = visibleProblems.find(p => p.id === queryProblemId) || null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 font-sans break-words [overflow-x:clip]">
      {/* Mobile: iOS input zoom band karo + tap-friendly */}
      <style>{`@media (max-width: 640px){ input, select, textarea { font-size: 16px !important; } }`}</style>
      {/* Popups */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[90vw]">
        {popups.map(p => (
          <div key={p.id} className={`rounded-xl shadow-xl border p-3.5 flex items-start gap-3 animate-[fadeIn_0.2s_ease-out] ${p.type === 'teacher' ? 'bg-emerald-900 border-emerald-700 text-emerald-50' : p.type === 'idea' ? 'bg-indigo-900 border-indigo-700 text-indigo-50' : 'bg-slate-900 border-slate-700 text-slate-50'}`}>
            <div className="mt-0.5">
              {p.type === 'teacher' ? <Megaphone className="w-4 h-4 text-emerald-300" /> : p.type === 'idea' ? <StickyNote className="w-4 h-4 text-indigo-300" /> : <CheckCircle2 className="w-4 h-4 text-slate-300" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold leading-tight">{p.title}</p>
              <p className="text-[11px] opacity-90 mt-0.5 leading-snug break-words">{p.message}</p>
            </div>
            <button onClick={() => dismissPopup(p.id)} className="opacity-60 hover:opacity-100 transition flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      {/* 📱 Sidebar overlay (mobile only) */}
      {showSidebar && <div className="fixed inset-0 bg-slate-900/50 z-[55] lg:hidden" onClick={() => setShowSidebar(false)} />}

      {/* Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 px-3 sm:px-6 py-3 flex items-center justify-between gap-2 shadow-md sticky top-0 z-50">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button onClick={() => setShowSidebar(true)} className="lg:hidden p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition flex-shrink-0" title="Menu"><Menu className="w-5 h-5" /></button>
          <div>
            <h1 className="font-extrabold text-base sm:text-lg leading-tight tracking-tight">Class<span className="text-orange-500">Brainstorm</span></h1>
            <p className="hidden sm:block text-xs text-slate-400">Share ideas together</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {role === 'teacher' ? (
            <span className="hidden sm:flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-3.5 py-1.5 rounded-xl">
              <Shield className="w-4 h-4" /> Teacher View
            </span>
          ) : (
            <span className="hidden sm:flex items-center gap-2 text-xs font-semibold text-indigo-300 bg-indigo-950/80 border border-indigo-800 px-3.5 py-1.5 rounded-xl">
              <Users className="w-4 h-4" /> Student View
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="relative">
            <button onClick={() => setShowNotifDropdown(!showNotifDropdown)} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg relative transition">
              <Bell className="w-4 h-4" />
              {visibleNotifications.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full">{visibleNotifications.length}</span>
              )}
            </button>
            {showNotifDropdown && (
              <div className="fixed left-2 right-2 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                  <span className="font-bold text-xs">Notifications</span>
                  <span className="text-[10px] text-slate-400">{visibleNotifications.length} relevant</span>
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {visibleNotifications.length > 0 ? visibleNotifications.map(n => (
                    <div key={n.id} className="p-2.5 text-xs hover:bg-slate-50 transition">
                      <p className="text-slate-700 leading-tight">{n.text}</p>
                      <span className="text-[10px] text-slate-400 mt-1 block">{n.time}</span>
                    </div>
                  )) : (
                    <div className="p-6 text-center text-[11px] text-slate-400 italic">No notifications for you yet.</div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 px-2 sm:px-3 py-1.5 rounded-xl flex items-center gap-2 min-w-0 max-w-[120px] sm:max-w-none">
            <span className="truncate">{role === 'student' ? `${currentStudent?.name || currentUser?.name} (you)` : (currentUser?.name || 'Teacher')}</span>
            {role === 'student' && currentStudent && (currentStudent.streak || 0) > 0 && (
              <span className="flex items-center text-amber-400 font-bold text-[11px] bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800"><Flame className="w-3 h-3 fill-amber-500 mr-0.5" /> {currentStudent.streak}d</span>
            )}
          </div>
          <button onClick={handleLogout} className="p-2 bg-slate-800 hover:bg-red-900/40 text-slate-300 hover:text-red-400 rounded-lg transition border border-slate-700" title="Sign Out"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      {/* Announcement Bar */}
      {announcements.length > 0 && (
        <div className="bg-indigo-900 text-indigo-100 px-3 sm:px-6 py-2 border-b border-indigo-800 flex items-center gap-3 text-xs">
          <Megaphone className="w-4 h-4 text-indigo-300 flex-shrink-0" />
          <div className="flex-1 min-w-0 break-words"><span className="font-bold mr-2 text-indigo-200">[{announcements[0].title}]:</span><span>{announcements[0].content}</span></div>
          <span className="hidden sm:inline text-[10px] text-indigo-300">{announcements[0].time}</span>
        </div>
      )}

      {/* STUDENT VIEW */}
      {role === 'student' && currentStudent && (
        <main className="flex-1 p-3 sm:p-6 max-w-7xl w-full mx-auto grid grid-cols-12 gap-4 sm:gap-6">
          <aside className={`fixed inset-y-0 left-0 z-[60] w-[88%] max-w-sm overflow-y-auto overscroll-contain bg-slate-100 p-3 shadow-2xl transition-transform duration-300 ease-out ${showSidebar ? 'translate-x-0' : '-translate-x-full'} lg:static lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0 lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none lg:col-span-4 col-span-12 min-w-0 flex flex-col gap-4 sm:gap-5`}>
            <div className="lg:hidden flex items-center justify-between pb-2 border-b border-slate-300">
              <span className="font-extrabold text-sm text-slate-800">Class<span className="text-orange-500">Brainstorm</span> <span className="text-slate-400 font-semibold text-xs">• Menu</span></span>
              <button onClick={() => setShowSidebar(false)} className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-red-600" title="Close"><X className="w-4 h-4" /></button>
            </div>
            {/* Top Thinkers */}
            <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-slate-900 text-slate-900 rounded-2xl p-4 border border-amber-300 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-amber-200 mb-3">
                <div className="flex items-center gap-1.5"><Trophy className="w-4 h-4 text-amber-600" /><h2 className="font-bold text-slate-900 text-sm">Top 5 Thinkers & Streaks</h2></div>
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Flame className="w-3 h-3 text-orange-600 fill-orange-500" /> Live Ranking</span>
              </div>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {leaderboardData.length === 0 && (
                  <p className="text-[11px] text-slate-400 italic text-center py-4">No students yet. Real activity will appear here.</p>
                )}
                {leaderboardData.slice(0, 5).map((st, rank) => {
                  const isCurrent = st.id === currentStudentId;
                  const streakVal = st.streak || 0;
                  return (
                    <div key={st.id} className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition ${rank === 0 ? 'bg-amber-100/80 border-amber-300 text-amber-950 font-semibold' : rank === 1 ? 'bg-slate-200/80 border-slate-300 text-slate-900' : rank === 2 ? 'bg-orange-100/70 border-orange-200 text-orange-950' : isCurrent ? 'bg-indigo-50 border-indigo-300 font-semibold' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] flex-shrink-0 ${rank === 0 ? 'bg-amber-500 text-white' : rank === 1 ? 'bg-slate-400 text-white' : rank === 2 ? 'bg-orange-400 text-white' : 'bg-slate-200 text-slate-700'}`}>{rank + 1}</span>
                        <span className="truncate flex items-center gap-1 text-slate-800">{st.avatar} {isCurrent ? `${st.name} (You)` : st.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {streakVal > 0 && (
                          <span className="flex items-center text-[11px] font-extrabold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded"><Flame className="w-3 h-3 fill-orange-500 text-orange-500 mr-0.5" /> {streakVal}d</span>
                        )}
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{st.ideasCount} Ideas</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* My Assigned Tasks */}
            {(() => {
              const myDevs = developments.filter(d => {
                const idea = ideas.find(i => i.id === d.ideaId);
                return idea && idea.studentId === currentStudentId;
              });
              if (myDevs.length === 0) return null;
              return (
                <div className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-indigo-300 shadow-md">
                  <div className="flex items-center justify-between pb-3 border-b border-indigo-100 mb-3">
                    <div className="flex items-center gap-2"><Rocket className="w-4 h-4 text-indigo-600" /><h2 className="font-bold text-slate-800 text-sm">My Assigned Tasks</h2></div>
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">{myDevs.length} active</span>
                  </div>
                  <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                    {myDevs.map(d => {
                      const idea = ideas.find(i => i.id === d.ideaId);
                      const stageObj = DEVELOPMENT_STAGES.find(s => s.key === d.stage);
                      const isPrivate = d.visibleToOthers === false;
                      return (
                        <div key={d.id} className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200 text-xs">
                          <p className="font-semibold text-slate-800 mb-1.5 italic">"{idea?.content}"</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full border ${stageObj.cls}`}>{stageObj.emoji} {stageObj.label}</span>
                            {isPrivate && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full"><Lock className="w-2.5 h-2.5" /> Private</span>}
                          </div>
                          {d.note && <div className="mt-2 p-2 bg-white rounded-lg border border-indigo-100"><p className="text-[10px] font-bold text-indigo-700 uppercase mb-0.5">Next Step</p><p className="text-slate-700">{d.note}</p></div>}
                          <div className="flex flex-wrap justify-between gap-2 mt-2 text-[10px] text-slate-500">
                            {d.groupName && <span>👥 {d.groupName}</span>}
                            {d.deadline && <span>🎯 {new Date(d.deadline).toLocaleDateString()}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Groups Management */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2"><Users className="w-4 h-4 text-indigo-600" /><h2 className="font-bold text-slate-800 text-sm">All Class Groups ({groups.length})</h2></div>
                <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">All Student Control</span>
              </div>
              <div className="space-y-4 max-h-[280px] overflow-y-auto pr-1 mb-4">
                {groups.map(g => {
                  const groupMembers = students.filter(s => s.groupId === g.id);
                  const isCurrentStudentGroup = g.id === currentGroup?.id;
                  return (
                    <div key={g.id} className={`p-3.5 rounded-xl border transition ${isCurrentStudentGroup ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">{g.name}{isCurrentStudentGroup && <span className="text-[9px] bg-indigo-600 text-white font-bold px-1.5 py-0.2 rounded">Your Group</span>}</span>
                        <span className="text-[10px] text-slate-500 font-medium">{groupMembers.length} {groupMembers.length === 1 ? 'member' : 'members'}</span>
                      </div>
                      <div className="space-y-1.5 mb-2.5">
                        {groupMembers.length > 0 ? (
                          groupMembers.map(m => (
                            <div key={m.id} className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs shadow-2xs">
                              <span className="flex items-center gap-2 font-medium text-slate-700">{m.avatar} {m.id === currentStudentId ? `${m.name} (you)` : m.name}</span>
                              <button onClick={() => handleRemoveMemberFromGroup(g.id, m.id)} className="text-slate-400 hover:text-red-500 transition p-0.5" title={`Remove ${m.name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          ))
                        ) : (<p className="text-[11px] text-slate-400 italic px-1">No members in this group yet.</p>)}
                      </div>
                      <form onSubmit={(e) => handleAddMemberToGroup(g.id, e)} className="flex gap-1.5">
                        <input type="text" placeholder="Add student..." value={groupMemberInputs[g.id] || ''} onChange={(e) => setGroupMemberInputs({ ...groupMemberInputs, [g.id]: e.target.value })} className="flex-1 text-[11px] px-2.5 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" />
                        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-0.5"><UserPlus className="w-3 h-3" /> Add</button>
                      </form>
                    </div>
                  );
                })}
                {groups.length === 0 && <p className="text-[11px] text-slate-400 italic text-center py-4">No groups yet. Create the first one below!</p>}
              </div>
              <form onSubmit={handleCreateGroup} className="pt-3 border-t border-slate-100 flex gap-2">
                <input type="text" placeholder="New group name..." value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="flex-1 text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                <button type="submit" className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">Create Group</button>
              </form>
            </div>

            {/* Private Chat */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex-1 flex flex-col min-h-[260px]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-emerald-600" /><h2 className="font-bold text-slate-800 text-sm">Private Group Chat</h2></div>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded"><Lock className="w-3 h-3 text-slate-500" /> Hidden from Teacher</span>
              </div>
              <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[180px] pr-1 mb-3">
                {privateChats.filter(c => c.groupId === currentGroup?.id).map(chat => (
                  <div key={chat.id} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-slate-700">{chat.sender === currentStudent.name ? `${chat.sender} (you)` : chat.sender}</span>
                      <span className="text-[10px] text-slate-400">{chat.time}{chat.edited && ' • edited'}<ActionBtns canEdit={chat.studentId === currentStudentId} canDelete={chat.studentId === currentStudentId} onEdit={() => setEditing('chat:' + chat.id)} onDelete={() => handleDeleteChat(chat)} /></span>
                    </div>
                    {editing === 'chat:' + chat.id ? <InlineEdit initial={chat.text} names={mentionNames} onSave={(v) => handleEditChat(chat.id, v)} onCancel={() => setEditing(null)} /> : <p className="text-slate-600"><MentionText text={chat.text} names={mentionNames} /></p>}
                  </div>
                ))}
                {currentGroup && privateChats.filter(c => c.groupId === currentGroup.id).length === 0 && (
                  <p className="text-[11px] text-slate-400 italic text-center py-4">No messages yet. Start the conversation!</p>
                )}
                {!currentGroup && (
                  <p className="text-[11px] text-slate-400 italic text-center py-4">Join or create a group to chat privately.</p>
                )}
              </div>
              <form onSubmit={handleSendPrivateChat} className="flex gap-2">
                <MentionInput placeholder={currentGroup ? "Message your group... (type @ to mention)" : "Join a group to chat"} value={newChatText} onChange={setNewChatText} names={mentionNames} disabled={!currentGroup} className="text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50" />
                <button type="submit" disabled={!currentGroup} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-medium transition flex items-center gap-1 disabled:opacity-60"><Send className="w-3.5 h-3.5" /></button>
              </form>
            </div>
          </aside>

          <section className="col-span-12 lg:col-span-8 min-w-0 flex flex-col gap-4 sm:gap-5">
            {/* Active Problem */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-3 sm:gap-4 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded inline-block">Active Question</span>
                    <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2.5 py-0.5 rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> Time Remaining: {timeLeft}</span>
                    {!studentsCanSeeEachOther && <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full flex items-center gap-1"><Lock className="w-3 h-3" /> Private Mode</span>}
                  </div>
                  <h2 className="text-base font-bold text-slate-900">{activeProblem?.title || 'No active problem yet'}</h2>
                  <p className="text-xs text-slate-500 mt-1">{activeProblem?.description || 'Your teacher has not posted a problem yet.'}</p>
                </div>
                {visibleProblems.length > 0 && (
                  <select value={selectedProblemId} onChange={(e) => setSelectedProblemId(e.target.value)} className="w-full sm:w-auto sm:max-w-[260px] bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    {visibleProblems.map(p => <option key={p.id} value={p.id}>Task: {p.title.substring(0, 30)}...</option>)}
                  </select>
                )}
              </div>
              {!studentsCanSeeEachOther && activeProblem && (
                <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs flex items-start gap-2">
                  <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div><p className="font-bold text-amber-800">🔒 Private Mode</p><p className="text-amber-700 mt-0.5">You can only see <strong>your own</strong> responses.</p></div>
                </div>
              )}
              {activeProblem && (
                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-3 items-center">
                  <input type="text" placeholder="Write your idea..." value={newIdeaContent} onChange={(e) => setNewIdeaContent(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddIdea(); } }} className="w-full sm:w-auto sm:flex-1 sm:min-w-[240px] text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  <select value={newIdeaColor} onChange={(e) => setNewIdeaColor(e.target.value)} className="flex-1 sm:flex-none min-w-0 text-xs border border-slate-200 rounded-lg px-2 py-2 bg-slate-50 text-slate-700">
                    <option value="bg-yellow-200 border-yellow-400 text-yellow-900">🟨 Yellow</option>
                    <option value="bg-green-200 border-green-400 text-green-900">🟩 Green</option>
                    <option value="bg-blue-200 border-blue-400 text-blue-900">🟦 Blue</option>
                    <option value="bg-purple-200 border-purple-400 text-purple-900">🟪 Purple</option>
                  </select>
                  <select value={newIdeaVisibility} onChange={(e) => setNewIdeaVisibility(e.target.value)} className={`flex-1 sm:flex-none min-w-0 text-xs border rounded-lg px-2 py-2 focus:outline-none focus:ring-1 ${newIdeaVisibility === 'teacher' ? 'bg-purple-50 border-purple-300 text-purple-800 font-bold' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                    <option value="class">🌐 Everyone (Class)</option>
                    <option value="teacher">🔒 Only Teacher</option>
                  </select>
                  <button type="button" onClick={handleAddIdea} className="w-full sm:w-auto justify-center bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"><StickyNote className="w-3.5 h-3.5" /> Post Opinion</button>
                </div>
              )}
            </div>

            {/* Canvas */}
            <div className="bg-slate-200/80 rounded-2xl p-3 sm:p-6 border border-slate-300 shadow-inner min-h-[380px] relative overflow-hidden flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-white/90 backdrop-blur px-4 py-2 rounded-xl border border-slate-200 shadow-sm z-10">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-700">Class Canvas ({displayedIdeas.length} ideas)</span>
                  {!studentsCanSeeEachOther && <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1"><Lock className="w-3 h-3" /> Private Mode</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button onClick={() => setViewFilter('all')} className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${viewFilter === 'all' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>🌐 All Students Ideas</button>
                    <button onClick={() => setViewFilter('my-group')} className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition ${viewFilter === 'my-group' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>👥 My Group Only</button>
                  </div>
                </div>
              </div>
              <div className="relative dot-grid-bg rounded-xl border border-slate-300 bg-slate-100/60 overflow-auto p-4" style={{ height: CANVAS_HEIGHT, minWidth: '100%' }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start auto-rows-min">
                  {displayedIdeas.map((idea) => {
                    const displayName = idea.studentId === currentStudentId ? `${idea.studentName} (you)` : idea.studentName;
                    const dev = getDevelopment(idea.id);
                    const stageObj = dev ? DEVELOPMENT_STAGES.find(s => s.key === dev.stage) : null;
                    const canSeeProgress = dev && stageObj && (idea.studentId === currentStudentId || dev.visibleToOthers !== false);
                    const isOwner = idea.studentId === currentStudentId;
                    const isHiddenFromOthers = idea.visibleToStudents === false;
                    const isTeacherOnly = idea.teacherOnly === true;
                    return (
                      <div key={idea.id} className={`p-4 rounded-xl border-2 shadow-sm flex flex-col self-start w-full ${idea.color} ${isHiddenFromOthers && isOwner ? 'ring-2 ring-red-300 opacity-90' : ''} ${isTeacherOnly && isOwner ? 'ring-2 ring-purple-400' : ''}`}>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/10">{idea.tag}</span>
                            <span className="text-[10px] font-bold text-slate-700 bg-white/60 px-1.5 py-0.5 rounded">{idea.groupName}</span>
                          </div>
                          <div className="text-[11px] font-bold text-slate-800 mb-2 border-b border-black/10 pb-1 flex justify-between items-center gap-1 flex-wrap">
                            <span>by {displayName}</span>
                            <div className="flex items-center gap-1 flex-wrap">
                              {isTeacherOnly && isOwner && <span className="text-[9px] bg-purple-700 text-white px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" /> Teacher only</span>}
                              {isHiddenFromOthers && isOwner && <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5"><EyeOff className="w-2.5 h-2.5" /> Hidden from class</span>}
                              {isOwner && <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-bold">You</span>}
                            </div>
                          </div>
                          <p className="text-xs font-medium leading-relaxed">{idea.content}</p>
                          {(idea.rating > 0 || idea.badge) && (
                            <div className="mt-2 pt-2 border-t border-black/10 flex items-center justify-between text-[11px]">
                              {idea.rating > 0 && <span className="flex text-amber-600 font-bold items-center gap-0.5">{'★'.repeat(idea.rating)}</span>}
                              {idea.badge && <span className="bg-emerald-600 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-full">{idea.badge}</span>}
                            </div>
                          )}
                          {idea.teacherReply && (
                            <div className="mt-2 p-2 bg-white/80 rounded-lg border border-black/10 text-[11px] text-slate-800">
                              <span className="font-bold text-emerald-700 flex items-center gap-1"><CornerDownRight className="w-3 h-3" /> Teacher Feedback:</span>
                              <p className="mt-0.5 text-slate-700"><MentionText text={idea.teacherReply} names={mentionNames} /></p>
                            </div>
                          )}
                          {canSeeProgress && (
                            <div className="mt-2 p-2 bg-white/80 rounded-lg border border-black/10 text-[11px]">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={`inline-flex items-center gap-1 font-bold px-1.5 py-0.5 rounded-full border ${stageObj.cls}`}>{stageObj.emoji} {stageObj.label}</span>
                                {isOwner && <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-full border border-indigo-200">👑 Your Task</span>}
                                {!isOwner && dev.visibleToOthers !== false && <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full border border-slate-200">👥 Team Task</span>}
                              </div>
                              {dev.note && <p className="mt-1 text-slate-700"><b className="text-indigo-700">Next step:</b> {dev.note}</p>}
                              <div className="flex flex-wrap justify-between gap-2 mt-1 text-[10px] text-slate-500">
                                {dev.groupName && <span>👥 {dev.groupName}</span>}
                                {dev.deadline && <span>🎯 {new Date(dev.deadline).toLocaleDateString()}</span>}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="mt-4 pt-2 border-t border-black/10 flex justify-between items-center gap-1 flex-wrap">
                          <button onClick={() => handleUpvoteIdea(idea.id)} className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded bg-white/60 hover:bg-white transition"><ThumbsUp className="w-3 h-3" /> {idea.votes}</button>
                          {isOwner && (
                            <button onClick={() => handleToggleTeacherOnly(idea.id)} title={isTeacherOnly ? 'Make visible to class' : 'Make teacher-only'} className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded transition ${isTeacherOnly ? 'bg-purple-700 text-white hover:bg-purple-800' : 'bg-white/60 hover:bg-white text-slate-700'}`}>
                              {isTeacherOnly ? <><Lock className="w-3 h-3" /> Private</> : <><Globe className="w-3 h-3" /> Public</>}
                            </button>
                          )}
                          {isOwner && (
                            <button onClick={() => handleDeleteIdea(idea)} title="Delete my post" className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded bg-white/60 hover:bg-red-600 hover:text-white text-red-600 transition"><Trash2 className="w-3 h-3" /> Delete</button>
                          )}
                          <button onClick={() => setOpenIdeaCommentsId(openIdeaCommentsId === idea.id ? null : idea.id)} className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded bg-white/60 hover:bg-white transition"><MessageSquare className="w-3 h-3" /> {(idea.ideaComments || []).length}</button>
                        </div>
                        {openIdeaCommentsId === idea.id && (
                          <div className="mt-2 pt-2 border-t border-black/10">
                            {(idea.ideaComments || []).length > 0 && (
                              <div className="space-y-1.5 mb-2 max-h-[120px] overflow-y-auto pr-0.5">
                                {idea.ideaComments.map(c => (
                                  <div key={c.id} className="bg-white/80 rounded-lg px-2 py-1.5 text-[11px]">
                                    <div className="flex justify-between items-center mb-0.5">
                                      <span className="font-bold text-slate-800">{c.studentId === currentStudentId ? `${c.studentName} (you)` : c.studentName}</span>
                                      <span className="text-slate-500 text-[10px]">{c.time}{c.edited && ' • edited'}<ActionBtns canEdit={c.studentId === currentStudentId} canDelete={c.studentId === currentStudentId} onEdit={() => setEditing('ic:' + c.id)} onDelete={() => handleDeleteIdeaComment(idea, c)} /></span>
                                    </div>
                                    {editing === 'ic:' + c.id ? <InlineEdit initial={c.text} names={mentionNames} onSave={(v) => handleEditIdeaComment(idea, c.id, v)} onCancel={() => setEditing(null)} /> : <p className="text-slate-700"><MentionText text={c.text} names={mentionNames} /></p>}
                                  </div>
                                ))}
                              </div>
                            )}
                            <form onSubmit={(e) => { e.preventDefault(); handleAddIdeaComment(idea.id); }} className="flex gap-1.5">
                              <MentionInput value={newIdeaCommentMap[idea.id] || ''} onChange={(v) => setNewIdeaCommentMap({ ...newIdeaCommentMap, [idea.id]: v })} names={mentionNames} placeholder="Add a comment... (@ to mention)" className="text-[11px] px-2 py-1.5 rounded-lg border border-black/10 bg-white/90 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                              <button type="submit" className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white transition"><Send className="w-3 h-3" /></button>
                            </form>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {displayedIdeas.length === 0 && (
                  <div className="h-full flex items-center justify-center text-center text-slate-500 text-xs">{!activeProblem ? 'Waiting for your teacher to post a problem…' : !studentsCanSeeEachOther ? 'Private Mode — post your first idea.' : 'No ideas yet. Be the first!'}</div>
                )}
              </div>
            </div>

            {/* Discussion */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                <div className="flex items-center gap-2"><HelpCircle className="w-4 h-4 text-indigo-600" /><h2 className="font-bold text-slate-800 text-sm">Class Discussion</h2></div>
                {!studentsCanSeeEachOther && <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1"><Lock className="w-3 h-3" /> Only Your Questions Shown</span>}
              </div>
              <div className="space-y-2 mb-3 max-h-[160px] overflow-y-auto">
                {visibleProblemComments.map(pc => (
                  <div key={pc.id} className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="font-bold text-indigo-900">{pc.studentName === currentStudent.name ? `${pc.studentName} (you)` : pc.studentName}</span>
                      <span className="text-[10px] text-slate-400">{pc.time}{pc.edited && ' • edited'}<ActionBtns canEdit={pc.studentId === currentStudentId} canDelete={pc.studentId === currentStudentId} onEdit={() => setEditing('pc:' + pc.id)} onDelete={() => handleDeleteQuestion(pc)} /></span>
                    </div>
                    {editing === 'pc:' + pc.id ? <InlineEdit initial={pc.text} names={mentionNames} onSave={(v) => handleEditQuestion(pc, v)} onCancel={() => setEditing(null)} /> : <p className="text-slate-700"><MentionText text={pc.text} names={mentionNames} /></p>}
                    {pc.teacherReply && <div className="mt-2 pl-3 border-l-2 border-emerald-500 text-[11px] text-emerald-900 font-medium"><span className="font-bold text-emerald-700">Teacher: </span><MentionText text={pc.teacherReply} names={mentionNames} />{pc.teacherReplyEdited && <span className="text-[9px] text-slate-400"> (edited)</span>}</div>}
                    {(pc.studentReplies || []).length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {pc.studentReplies.map(sr => (
                          <div key={sr.id} className="pl-3 border-l-2 border-indigo-300 text-[11px] text-slate-700">
                            <span className="font-bold text-indigo-700">{sr.studentId === currentStudentId ? `${sr.studentName} (you)` : sr.studentName}: </span>{editing === 'sr:' + sr.id ? <InlineEdit initial={sr.text} names={mentionNames} onSave={(v) => handleEditStudentReply(pc, sr.id, v)} onCancel={() => setEditing(null)} /> : <MentionText text={sr.text} names={mentionNames} />}{sr.edited && <span className="text-[9px] text-slate-400"> (edited)</span>}<ActionBtns canEdit={sr.studentId === currentStudentId} canDelete={sr.studentId === currentStudentId} onEdit={() => setEditing('sr:' + sr.id)} onDelete={() => handleDeleteStudentReply(pc, sr)} />
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex gap-1.5">
                      <MentionInput placeholder="Reply... (@ to mention)" value={newStudentReplyMap[pc.id] || ''} onChange={(v) => setNewStudentReplyMap({ ...newStudentReplyMap, [pc.id]: v })} names={mentionNames} onEnter={() => handleStudentReplyToComment(pc.id)} className="text-[11px] px-2 py-1 border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                      <button type="button" onClick={() => handleStudentReplyToComment(pc.id)} className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-[11px] font-semibold px-2.5 py-1 rounded transition">Reply</button>
                    </div>
                  </div>
                ))}
                {visibleProblemComments.length === 0 && <p className="text-[11px] text-slate-400 italic text-center py-3">No questions yet. Ask your teacher anything!</p>}
              </div>
              <form onSubmit={handleSendProblemComment} className="flex gap-2">
                <MentionInput placeholder="Ask the teacher... (@ to mention)" value={newProbCommentText} onChange={setNewProbCommentText} names={mentionNames} disabled={!activeProblem} className="text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50" />
                <button type="submit" disabled={!activeProblem} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-xs font-medium transition disabled:opacity-60">Post</button>
              </form>
            </div>
          </section>
        </main>
      )}

      {/* TEACHER VIEW */}
      {role === 'teacher' && (
        <main className="flex-1 p-3 sm:p-6 max-w-7xl w-full mx-auto grid grid-cols-12 gap-4 sm:gap-6">
          <aside className={`fixed inset-y-0 left-0 z-[60] w-[88%] max-w-sm overflow-y-auto overscroll-contain bg-slate-100 p-3 shadow-2xl transition-transform duration-300 ease-out ${showSidebar ? 'translate-x-0' : '-translate-x-full'} lg:static lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0 lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none lg:col-span-4 col-span-12 min-w-0 flex flex-col gap-4 sm:gap-5`}>
            <div className="lg:hidden flex items-center justify-between pb-2 border-b border-slate-300">
              <span className="font-extrabold text-sm text-slate-800">Class<span className="text-orange-500">Brainstorm</span> <span className="text-slate-400 font-semibold text-xs">• Menu</span></span>
              <button onClick={() => setShowSidebar(false)} className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-red-600" title="Close"><X className="w-4 h-4" /></button>
            </div>
            <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-md">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" /> Live Group Contribution Metrics</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {groups.map(g => {
                  const groupIdeas = ideas.filter(i => i.groupId === g.id).length;
                  const activeCount = students.filter(s => s.groupId === g.id && (s.lastActive.includes('min') || s.lastActive === 'Just now')).length;
                  return (
                    <div key={g.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-sm text-slate-200">{g.name}</span>
                        <span className="flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">● {activeCount} Active</span>
                      </div>
                      <div className="text-2xl font-black text-indigo-400 my-1">{groupIdeas} Ideas</div>
                      <p className="text-[10px] text-slate-400">Total Contributions</p>
                    </div>
                  );
                })}
                {groups.length === 0 && <p className="text-[11px] text-slate-400 italic col-span-2">No groups created yet.</p>}
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-slate-900 text-slate-900 rounded-2xl p-4 border border-amber-300 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-amber-200 mb-3">
                <div className="flex items-center gap-1.5"><Trophy className="w-4 h-4 text-amber-600" /><h3 className="font-bold text-slate-900 text-sm">Top 5 Students</h3></div>
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">Leaderboard</span>
              </div>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {leaderboardData.length === 0 && (
                  <p className="text-[11px] text-slate-400 italic text-center py-4">No students yet. Real activity will appear here.</p>
                )}
                {leaderboardData.slice(0, 5).map((st, rank) => {
                  const streakVal = st.streak || 0;
                  return (
                    <div key={st.id} className={`flex items-center justify-between p-2 rounded-xl border text-xs transition ${rank === 0 ? 'bg-amber-100/80 border-amber-300 text-amber-950 font-semibold' : rank === 1 ? 'bg-slate-200/80 border-slate-300 text-slate-900' : rank === 2 ? 'bg-orange-100/70 border-orange-200 text-orange-950' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] flex-shrink-0 ${rank === 0 ? 'bg-amber-500 text-white' : rank === 1 ? 'bg-slate-400 text-white' : rank === 2 ? 'bg-orange-400 text-white' : 'bg-slate-200 text-slate-700'}`}>{rank + 1}</span>
                        <span className="truncate text-slate-800 font-medium">{st.avatar} {st.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {streakVal > 0 && (
                          <span className="flex items-center text-[10px] font-extrabold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded"><Flame className="w-3 h-3 fill-orange-500 mr-0.5" /> {streakVal}d</span>
                        )}
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">{st.highRatedIdeas} Top Rated</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-600" /> Manage Problems <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full ml-auto">{visibleProblems.length} visible</span></h3>
              <div className="flex flex-col gap-3 max-h-[380px] overflow-y-auto pr-1">
                {visibleProblems.map(prob => {
                  const probStudentsCanSee = prob.peerResponsesVisible !== false;
                  const clusterCount = (clusteredIdeasByProblem[prob.id] || []).length;
                  const similarCount = (clusteredIdeasByProblem[prob.id] || []).filter(c => c.items.length >= 2).length;
                  const owner = isProblemOwner(prob);
                  const shared = prob.sharedWithTeachers === true;
                  return (
                    <div key={prob.id} onClick={() => { setSelectedProblemId(prob.id); setShowSidebar(false); }} className={`p-4 rounded-xl border transition cursor-pointer relative ${selectedProblemId === prob.id ? 'bg-emerald-50/50 border-emerald-500 ring-1 ring-emerald-500' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                      <div className="flex justify-between items-start mb-1 pr-12">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-bold text-slate-800 text-sm">{prob.title}</h3>
                          {!owner && <span className="text-[9px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" /> View only</span>}
                          {shared && <span className="text-[9px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-300 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Globe className="w-2.5 h-2.5" /> Shared</span>}
                        </div>
                        <span className="text-[10px] text-slate-400">{prob.createdTime}</span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2 mb-3">{prob.description}</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1"><Layers className="w-3 h-3" /> {clusterCount} cluster{clusterCount === 1 ? '' : 's'}</span>
                        {similarCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white flex items-center gap-1"><Link2 className="w-3 h-3" /> {similarCount} similar</span>}
                      </div>
                      {owner && (
                        <div className="absolute top-3 right-3 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => handleEditProblemClick(prob)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-md transition" title="Edit Problem"><Edit3 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteProblem(prob.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-md transition" title="Delete Problem"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                      <div className="text-[11px] font-semibold text-slate-600 pt-2 border-t border-slate-100 flex items-center gap-1 mb-2">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" /><span>Deadline: {prob.deadline ? new Date(prob.deadline).toLocaleString() : 'No Deadline'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {owner ? (
                          <>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${probStudentsCanSee ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>{probStudentsCanSee ? '👁️ Visible' : '🙈 Hidden'}</span>
                            <div className="flex items-center gap-1 flex-wrap">
                              <button onClick={() => handleToggleStudentsVisibility(prob.id)} className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border transition ${probStudentsCanSee ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`} title={probStudentsCanSee ? 'Hide' : 'Show'}>
                                {probStudentsCanSee ? <><Lock className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Show</>}
                              </button>
                              <button onClick={() => handleToggleProblemShare(prob.id)} className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border transition ${shared ? 'bg-cyan-50 text-cyan-800 border-cyan-300 hover:bg-cyan-100' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`} title={shared ? 'Stop sharing' : 'Share with all teachers'}>
                                <Globe className="w-3 h-3" /> {shared ? 'Unshare' : 'Share'}
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><UserCheck className="w-3 h-3" /> By {prob.teacherName || 'Teacher'}</span>
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Eye className="w-3 h-3" /> View Only</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {visibleProblems.length === 0 && (
                  <p className="text-[11px] text-slate-400 italic text-center py-4">You haven't created any problems yet.</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-indigo-600" /> Group Members</h3>
              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                {groups.map(g => {
                  const members = participationData.filter(s => s.groupId === g.id);
                  return (
                    <div key={g.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-indigo-950">{g.name}</span>
                        <span className="text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-full">{members.length} member{members.length === 1 ? '' : 's'}</span>
                      </div>
                      {members.length === 0 ? <p className="text-[11px] text-slate-400 italic">No members in this group yet</p> : (
                        <ul className="space-y-1">
                          {members.map(m => (
                            <li key={m.id} className="flex items-center justify-between text-xs text-slate-700">
                              <span>{m.avatar} {m.name}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${m.status.cls}`}>{m.status.emoji} {m.status.label}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
                {groups.length === 0 && <p className="text-[11px] text-slate-400 italic text-center py-4">No groups yet.</p>}
              </div>
            </div>
          </aside>

          <section className="col-span-12 lg:col-span-8 min-w-0 flex flex-col gap-4 sm:gap-5">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Instructor Dashboard</span>
                <h2 className="text-lg font-bold text-slate-900 mt-1">Hi {currentUser?.name || 'Teacher'} — Class Overview</h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={handleGenerateAISummary} disabled={generatingSummary} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm disabled:opacity-60"><Sparkles className="w-4 h-4" /> {generatingSummary ? 'Analyzing…' : 'AI Summary'}</button>
                <button onClick={handleExportExcel} className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm" title="Download detailed Excel report"><Download className="w-4 h-4" /> Export Excel</button>
                <button onClick={handleExportReport} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm"><FileText className="w-4 h-4" /> Export PDF</button>
                <button onClick={() => { setEditingProblem(null); setTeacherProblemTitle(''); setTeacherProblemDesc(''); setTeacherProblemDeadline(''); setTeacherProblemPeerVisible(true); setTeacherProblemShared(false); setShowTeacherModal(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm"><Plus className="w-4 h-4" /> Create Problem</button>
              </div>
            </div>

            {activeProblem && (
              <div className={`rounded-2xl p-4 border shadow-sm flex flex-wrap items-center justify-between gap-3 ${studentsCanSeeEachOther ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-300'}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${studentsCanSeeEachOther ? 'bg-emerald-200/70' : 'bg-amber-200/70'}`}>{studentsCanSeeEachOther ? <Eye className="w-5 h-5 text-emerald-700" /> : <Lock className="w-5 h-5 text-amber-800" />}</div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">{studentsCanSeeEachOther ? '👁️ Visible to students' : '🙈 Hidden from students'}</p>
                    <p className="text-[11px] text-slate-600 mt-0.5"><strong>{activeProblem?.title}</strong></p>
                  </div>
                </div>
                {canManageActiveProblem && (
                  <button onClick={() => handleToggleStudentsVisibility(activeProblem.id)} className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl border transition shadow-sm ${studentsCanSeeEachOther ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700' : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'}`}>
                    {studentsCanSeeEachOther ? <><Lock className="w-4 h-4" /> Hide</> : <><Eye className="w-4 h-4" /> Show</>}
                  </button>
                )}
              </div>
            )}

            <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-1.5">
              {[
                { k: 'dashboard', l: 'Dashboard', Icon: Activity },
                { k: 'pipeline', l: 'Assigned Tasks', Icon: Rocket },
                { k: 'performance', l: 'Participation', Icon: TrendingUp },
                { k: 'queries', l: 'Review & Questions', Icon: HelpCircle }
              ].map(({ k, l, Icon }) => (
                <button
                  key={k}
                  onClick={() => { setTeacherTab(k); if (k === 'queries') setQueryProblemId(''); }}
                  className={`flex-1 min-w-[120px] sm:min-w-[140px] flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${teacherTab === k ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                ><Icon className="w-4 h-4" /> {l}</button>
              ))}
            </div>

            {/* DASHBOARD */}
            {teacherTab === 'dashboard' && (
              <>
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><Rocket className="w-4 h-4 text-indigo-600" /> Task Assignment Board</h3>
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">{developments.length} assigned</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {DEVELOPMENT_STAGES.map(s => {
                      const items = developments.filter(d => d.stage === s.key);
                      return (
                        <div key={s.key} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                          <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 ${s.cls}`}>{s.emoji} {s.label}</div>
                          <p className="text-lg font-black text-slate-800 mt-2">{items.length}</p>
                          <div className="space-y-1 mt-1">
                            {items.slice(0, 3).map(d => {
                              const idea = ideas.find(i => i.id === d.ideaId);
                              return <p key={d.id} className="text-[10px] text-slate-600 truncate" title={idea?.content}><span className="font-semibold">{idea?.studentName}:</span> {idea?.content}{d.visibleToOthers === false && ' 🔒'}</p>;
                            })}
                            {items.length > 3 && <p className="text-[10px] text-indigo-600 font-bold">+{items.length - 3} more</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-slate-200/80 rounded-2xl p-3 sm:p-6 border border-slate-300 shadow-inner flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-white/90 backdrop-blur px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-indigo-600" /><span className="text-xs font-bold text-slate-700">Class Canvas ({displayedIdeas.length} ideas)</span></div>
                  </div>
                  <div ref={canvasRef} className="relative dot-grid-bg rounded-xl border border-slate-300 bg-slate-100/60 overflow-auto p-4" style={{ height: 320, minWidth: '100%' }}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start auto-rows-min">
                      {displayedIdeas.map((idea) => {
                        const dev = getDevelopment(idea.id);
                        const stageObj = dev ? DEVELOPMENT_STAGES.find(s => s.key === dev.stage) : null;
                        const isHidden = idea.visibleToStudents === false;
                        const isTeacherOnly = idea.teacherOnly === true;
                        return (
                          <div key={idea.id} className={`p-3 rounded-xl border shadow-sm self-start w-full ${idea.color} ${isHidden ? 'ring-2 ring-red-300 opacity-90' : ''} ${isTeacherOnly ? 'ring-2 ring-purple-400' : ''}`}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-extrabold uppercase bg-black/10 px-1.5 py-0.5 rounded">{idea.tag}</span>
                              <span className="text-[10px] font-bold text-slate-700 bg-white/60 px-1.5 py-0.5 rounded">{idea.groupName}</span>
                            </div>
                            <p className="text-xs font-semibold text-slate-800 border-b border-black/10 pb-1 mb-1 flex justify-between items-center gap-1 flex-wrap">
                              <span>{idea.studentName}</span>
                              <span className="flex items-center gap-1 flex-wrap">
                                {isTeacherOnly && <span className="text-[9px] bg-purple-700 text-white px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" /> Teacher only</span>}
                                {isHidden && <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5"><EyeOff className="w-2.5 h-2.5" /> Hidden</span>}
                              </span>
                            </p>
                            <p className="text-xs">{idea.content}</p>
                            {stageObj && <span className={`inline-flex items-center gap-1 mt-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${stageObj.cls}`}>{stageObj.emoji} {stageObj.label}{dev.visibleToOthers === false && <Lock className="w-2.5 h-2.5 ml-0.5" />}</span>}
                          </div>
                        );
                      })}
                    </div>
                    {displayedIdeas.length === 0 && (
                      <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">No ideas posted yet.</div>
                    )}
                  </div>
                </div>

                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><Megaphone className="w-4 h-4 text-indigo-600" /> Add Announcement</h3>
                  <form onSubmit={handleCreateAnnouncement} className="flex flex-col md:flex-row gap-3">
                    <input type="text" placeholder="Title..." value={newAnnouncementTitle} onChange={(e) => setNewAnnouncementTitle(e.target.value)} className="w-full md:w-1/3 text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                    <input type="text" placeholder="Content..." value={newAnnouncementText} onChange={(e) => setNewAnnouncementText(e.target.value)} className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                    <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition">Post Announcement</button>
                  </form>
                </div>
              </>
            )}

            {/* PIPELINE */}
            {teacherTab === 'pipeline' && (
              <>
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-2"><Rocket className="w-4 h-4 text-indigo-600" /> Assigned Tasks Pipeline</h3>
                  <p className="text-[11px] text-slate-500 mb-4">Track each idea from shortlist to implemented.</p>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    {DEVELOPMENT_STAGES.map(s => {
                      const items = developments.filter(d => d.stage === s.key);
                      return (
                        <div key={s.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3 min-h-[200px]">
                          <div className={`text-[11px] font-bold px-2 py-1 rounded-full border inline-flex items-center gap-1 mb-2 ${s.cls}`}>{s.emoji} {s.label}</div>
                          <p className="text-xs text-slate-500 mb-2">{items.length} idea{items.length === 1 ? '' : 's'}</p>
                          <div className="space-y-2">
                            {items.map(d => {
                              const idea = ideas.find(i => i.id === d.ideaId);
                              const prob = idea ? problems.find(p => p.id === idea.problemId) : null;
                              const owner = prob ? isProblemOwner(prob) : false;
                              return (
                                <div key={d.id} className="p-2 bg-white rounded-lg border border-slate-200 text-[11px]">
                                  <p className="font-bold text-slate-800 truncate">{idea?.studentName}</p>
                                  <p className="text-slate-600 line-clamp-2 mt-0.5">{idea?.content}</p>
                                  {d.note && <p className="text-[10px] text-indigo-700 mt-1"><b>Next:</b> {d.note}</p>}
                                  <div className="flex items-center justify-between mt-1.5">
                                    {owner ? (
                                      <button onClick={() => idea && handleOpenDevelop(idea)} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"><Edit3 className="w-3 h-3" /> Update</button>
                                    ) : (
                                      <span className="text-[9px] font-bold text-slate-500 flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" /> View only</span>
                                    )}
                                    {d.visibleToOthers === false && <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" /> Private</span>}
                                  </div>
                                </div>
                              );
                            })}
                            {items.length === 0 && <p className="text-[10px] text-slate-400 italic">No ideas in this stage yet.</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2"><Rocket className="w-4 h-4 text-indigo-600" /> All Ideas — Assign Tasks</h3>
                  <div className="space-y-6 max-h-[600px] overflow-y-auto pr-1">
                    {visibleProblems.map((prob, pIdx) => {
                      const probIdeas = ideas.filter(i => i.problemId === prob.id);
                      if (probIdeas.length === 0) return null;
                      const owner = isProblemOwner(prob);
                      return (
                        <div key={prob.id}>
                          <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-indigo-100 flex-wrap">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-600 text-white">Problem {pIdx + 1}</span>
                            <h4 className="font-bold text-slate-800 text-sm flex-1 min-w-0 truncate">{prob.title}</h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex-shrink-0">{probIdeas.length} opinion{probIdeas.length === 1 ? '' : 's'}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {probIdeas.map(idea => {
                              const dev = getDevelopment(idea.id);
                              const stageObj = dev ? DEVELOPMENT_STAGES.find(s => s.key === dev.stage) : null;
                              return (
                                <div key={idea.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs flex flex-col justify-between space-y-2">
                                  <div>
                                    <div className="flex justify-between items-center mb-1 gap-1 flex-wrap">
                                      <span className="font-bold text-indigo-900">{idea.studentName}</span>
                                      <div className="flex items-center gap-1 flex-wrap">
                                        {idea.teacherOnly && <span className="text-[9px] font-bold bg-purple-700 text-white px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" /> Teacher only</span>}
                                        <span className="text-[10px] text-slate-500">{idea.groupName}</span>
                                      </div>
                                    </div>
                                    <p className="text-slate-700">{idea.content}</p>
                                    {idea.rating > 0 && <p className="text-amber-500 mt-1">{'★'.repeat(idea.rating)}</p>}
                                  </div>
                                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
                                    {stageObj ? (
                                      <div className="flex items-center gap-1">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${stageObj.cls}`}>{stageObj.emoji} {stageObj.label}</span>
                                        {dev.visibleToOthers === false && <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" /> Private</span>}
                                      </div>
                                    ) : (<span className="text-[10px] text-slate-400 italic">Not assigned yet</span>)}
                                    {owner ? (
                                      <button onClick={() => handleOpenDevelop(idea)} className="flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-md border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 transition"><Rocket className="w-3 h-3" /> {dev ? 'Update Task' : 'Assign Task'}</button>
                                    ) : (
                                      <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Eye className="w-3 h-3" /> View only</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {visibleProblems.every(p => ideas.filter(i => i.problemId === p.id).length === 0) && (
                      <div className="text-center py-10"><Rocket className="w-10 h-10 text-slate-300 mx-auto mb-2" /><p className="text-xs text-slate-500">No ideas yet.</p></div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* PERFORMANCE */}
            {teacherTab === 'performance' && (
              <>
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2"><UserCheck className="w-4 h-4 text-indigo-600" /> Student Activity</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
                    {students.map(std => (
                      <div key={std.id} onClick={() => setSelectedStudentForAnalytics(std)} className="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-400 cursor-pointer transition shadow-xs">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-bold text-sm text-indigo-950 flex items-center gap-2">{std.avatar} {std.name}</span>
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">{std.lastActive}</span>
                        </div>
                        <div className="space-y-1.5 text-xs text-slate-600">
                          <div className="flex justify-between"><span>Ideas Posted</span><span className="font-bold text-slate-900">{std.ideasCount}</span></div>
                          <div className="flex justify-between"><span>Comments</span><span className="font-bold text-slate-900">{std.commentsCount}</span></div>
                          <div className="flex justify-between"><span>Streak Days</span><span className="font-bold text-orange-600 flex items-center gap-0.5"><Flame className="w-3 h-3 fill-orange-500" /> {std.streak || 0}d</span></div>
                          <div className="flex justify-between"><span>Upvotes Given</span><span className="font-bold text-slate-900">{std.upvotesGiven}</span></div>
                          <div className="flex justify-between"><span>Problems Attempted</span><span className="font-bold text-slate-900">{std.problemsAttempted}</span></div>
                        </div>
                      </div>
                    ))}
                    {students.length === 0 && <p className="text-[11px] text-slate-400 italic text-center py-4 col-span-2">No students yet.</p>}
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-indigo-600" /> Participation</h3>
                  <p className="text-[11px] text-slate-500 mb-3">Ideas + comments + upvotes</p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {[{ k: 'top', l: '🌟 Most Active' }, { k: 'active', l: '✅ Active' }, { k: 'low', l: '🟡 Low' }, { k: 'absent', l: '😴 Absent-minded' }, { k: 'none', l: '🚫 None' }].map(c => (
                      <span key={c.k} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">{c.l}: {participationData.filter(s => s.status.key === c.k).length}</span>
                    ))}
                  </div>
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {participationData.map(st => {
                      const grp = groups.find(g => g.id === st.groupId);
                      const maxS = Math.max(1, ...participationData.map(x => x.pScore));
                      return (
                        <div key={st.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-800 truncate">{st.avatar} {st.name}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${st.status.cls}`}>{st.status.emoji} {st.status.label}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(st.pScore / maxS) * 100}%` }} /></div>
                          <div className="flex flex-wrap justify-between gap-x-3 mt-1.5 text-[10px] text-slate-500">
                            <span>💡 {st.ideasCount} ideas</span><span>💬 {st.commentsCount} comments</span><span>👍 {st.upvotesGiven} upvotes</span><span>🕒 {st.lastActive}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 italic">{grp ? grp.name : 'No group'} • {st.status.note}</p>
                        </div>
                      );
                    })}
                    {participationData.length === 0 && <p className="text-[11px] text-slate-400 italic text-center py-4">No students yet.</p>}
                  </div>
                </div>
              </>
            )}

            {/* QUERIES */}
            {teacherTab === 'queries' && (
              <>
                {!queryProblem && (
                  <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-purple-600" /> Select a Problem to Review</h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">Click any problem to open its clusters, ideas & questions.</p>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500">{visibleProblems.length} problem{visibleProblems.length === 1 ? '' : 's'}</span>
                    </div>
                    {visibleProblems.length === 0 ? (
                      <div className="text-center py-12">
                        <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs text-slate-500">No problems yet. Create one to start reviewing.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {visibleProblems.map((prob, idx) => {
                          const probIdeas = ideas.filter(i => i.problemId === prob.id);
                          const clusters = clusteredIdeasByProblem[prob.id] || [];
                          const similarCount = clusters.filter(c => c.items.length >= 2).length;
                          const reviewedCount = probIdeas.filter(i => i.rating > 0).length;
                          const unratedCount = probIdeas.filter(i => !i.rating || i.rating === 0).length;
                          const hiddenCount = probIdeas.filter(i => i.visibleToStudents === false).length;
                          const topCount = probIdeas.filter(i => i.rating >= 4 || i.badge).length;
                          const questionsCount = problemComments.filter(pc => pc.problemId === prob.id).length;
                          const progressPct = probIdeas.length ? Math.round((reviewedCount / probIdeas.length) * 100) : 0;
                          return (
                            <button key={prob.id} onClick={() => { setQueryProblemId(prob.id); setClusterSearch(''); setClusterFilter('all'); setExpandedClusters({}); }} className="text-left p-4 rounded-xl border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 transition group">
                              <div className="flex justify-between items-start gap-3 flex-wrap">
                                <div className="flex-1 min-w-0 sm:min-w-[220px]">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">Problem {idx + 1}</span>
                                  <h4 className="font-bold text-slate-900 text-sm mt-2 group-hover:text-indigo-700 transition">{prob.title}</h4>
                                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{prob.description}</p>
                                </div>
                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg flex items-center gap-1 group-hover:bg-indigo-600 group-hover:text-white transition">Open →</span>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">💡 {probIdeas.length} Ideas</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1"><Layers className="w-3 h-3" /> {clusters.length} Clusters</span>
                                {similarCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white flex items-center gap-1"><Link2 className="w-3 h-3" /> {similarCount} Similar</span>}
                                {unratedCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">⏳ {unratedCount} Unrated</span>}
                                {hiddenCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">🙈 {hiddenCount} Hidden</span>}
                                {topCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">⭐ {topCount} Top</span>}
                                {questionsCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">❓ {questionsCount} Questions</span>}
                              </div>
                              <div className="mt-3">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[10px] font-bold text-slate-500">Review Progress</span>
                                  <span className="text-[10px] font-extrabold text-indigo-700">{reviewedCount} / {probIdeas.length} ({progressPct}%)</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${progressPct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progressPct}%` }} />
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {queryProblem && (() => {
                  const prob = queryProblem;
                  const probIdeas = ideas.filter(i => i.problemId === prob.id);
                  const canReview = isProblemOwner(prob);
                  let clusters = clusteredIdeasByProblem[prob.id] || [];
                  if (clusterSearch.trim()) {
                    const q = clusterSearch.toLowerCase();
                    clusters = clusters.map(c => ({ ...c, items: c.items.filter(i => i.content.toLowerCase().includes(q) || i.studentName.toLowerCase().includes(q) || i.groupName.toLowerCase().includes(q)) })).filter(c => c.items.length > 0);
                  }
                  if (clusterFilter === 'unrated') clusters = clusters.filter(c => c.items.some(i => !i.rating || i.rating === 0));
                  else if (clusterFilter === 'reviewed') clusters = clusters.filter(c => c.items.every(i => i.rating > 0));
                  else if (clusterFilter === 'hidden') clusters = clusters.filter(c => c.items.some(i => i.visibleToStudents === false));
                  else if (clusterFilter === 'top') clusters = clusters.filter(c => c.items.some(i => i.rating >= 4 || i.badge));
                  else if (clusterFilter === 'similar') clusters = clusters.filter(c => c.items.length >= 2);
                  clusters = [...clusters].sort((a, b) => {
                    if (clusterSort === 'votes') return b.totalVotes - a.totalVotes;
                    if (clusterSort === 'rating') return b.avgRating - a.avgRating;
                    if (clusterSort === 'newest') { const aT = parseInt((a.items[0]?.id || '').split('_')[1] || '0'); const bT = parseInt((b.items[0]?.id || '').split('_')[1] || '0'); return bT - aT; }
                    return b.items.length - a.items.length;
                  });
                  const totalIdeas = probIdeas.length;
                  const reviewedCount = probIdeas.filter(i => i.rating > 0).length;
                  const progressPct = totalIdeas ? Math.round((reviewedCount / totalIdeas) * 100) : 0;
                  const probQuestions = problemComments.filter(pc => pc.problemId === prob.id);

                  return (
                    <>
                      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <button onClick={() => { setQueryProblemId(''); setClusterSearch(''); setClusterFilter('all'); setExpandedClusters({}); }} className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition">
                            <ArrowLeft className="w-3.5 h-3.5" /> Back to Problems
                          </button>
                          <span className="text-[10px] font-bold text-slate-500">Viewing problem detail</span>
                        </div>
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">📚 Problem {visibleProblems.indexOf(prob) + 1}</span>
                          <h3 className="font-bold text-slate-900 text-base mt-2">{prob.title}</h3>
                          <p className="text-[11px] text-slate-500 mt-0.5">{prob.description}</p>
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">💡 {totalIdeas} Ideas</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1"><Layers className="w-3 h-3" /> {(clusteredIdeasByProblem[prob.id] || []).length} Clusters</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">❓ {probQuestions.length} Questions</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                        <div className="flex flex-wrap items-center gap-3 justify-between">
                          <div className="flex items-center gap-2"><Layers className="w-4 h-4 text-purple-600" /><span className="text-xs font-bold text-slate-800">Review Ideas</span></div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                              <input type="text" placeholder="Search ideas, students…" value={clusterSearch} onChange={(e) => setClusterSearch(e.target.value)} className="text-[11px] font-medium pl-7 pr-2 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-purple-500 w-48" />
                              <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                            </div>
                            <select value={clusterSort} onChange={(e) => setClusterSort(e.target.value)} className="text-[11px] font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500">
                              <option value="size">Sort: Cluster size</option>
                              <option value="votes">Sort: Most votes</option>
                              <option value="rating">Sort: Highest rating</option>
                              <option value="newest">Sort: Newest</option>
                            </select>
                            <select value={clusterThreshold} onChange={(e) => setClusterThreshold(parseFloat(e.target.value))} className="text-[11px] font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500">
                              <option value={0.25}>Grouping: Loose</option>
                              <option value={0.35}>Grouping: Balanced</option>
                              <option value={0.50}>Grouping: Strict</option>
                              <option value={0.65}>Grouping: Very Strict</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-100">
                          {[
                            { k: 'all', l: '📚 All Ideas', cls: 'bg-indigo-600 text-white' },
                            { k: 'unrated', l: '⏳ Unrated', cls: 'bg-amber-600 text-white' },
                            { k: 'reviewed', l: '✅ Reviewed', cls: 'bg-emerald-600 text-white' },
                            { k: 'hidden', l: '🙈 Hidden', cls: 'bg-red-600 text-white' },
                            { k: 'top', l: '⭐ Top Rated', cls: 'bg-purple-600 text-white' },
                            { k: 'similar', l: '🔗 Similar Ideas', cls: 'bg-indigo-800 text-white' },
                          ].map(f => (
                            <button key={f.k} onClick={() => setClusterFilter(f.k)} className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition ${clusterFilter === f.k ? f.cls + ' border-transparent shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{f.l}</button>
                          ))}
                          <span className="ml-auto text-[10px] font-bold text-slate-500">
                            {probIdeas.filter(i => i.rating === 0).length} unrated · {probIdeas.filter(i => i.rating > 0).length} reviewed · <span className="text-indigo-700">{(clusteredIdeasByProblem[prob.id] || []).filter(c => c.items.length >= 2).length} similar clusters</span>
                          </span>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-indigo-200 shadow-sm">
                        <div className="pb-3 border-b-2 border-indigo-100 mb-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold text-slate-500">Review Progress</span>
                            <span className="text-[10px] font-extrabold text-indigo-700">{reviewedCount} / {totalIdeas} ({progressPct}%)</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${progressPct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progressPct}%` }} />
                          </div>
                        </div>
                        {clusters.length === 0 ? (
                          <div className="text-center py-10">
                            <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                            <p className="text-xs text-slate-500">No clusters match your filters.</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {clusters.map((cluster, ci) => {
                              const color = CLUSTER_COLORS[ci % CLUSTER_COLORS.length];
                              const isExpanded = !!expandedClusters[cluster.id];
                              const unratedCount = cluster.items.filter(i => !i.rating || i.rating === 0).length;
                              const hiddenCount = cluster.items.filter(i => i.visibleToStudents === false).length;
                              const isSimilarCluster = cluster.items.length >= 2;
                              return (
                                <div key={cluster.id} className={`rounded-xl border-2 ${color.border} ${color.bg} overflow-hidden`}>
                                  <button onClick={() => toggleCluster(cluster.id)} className="w-full text-left px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 hover:bg-white/40 transition">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className={`text-sm transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                      <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${color.badge}`}><Layers className="w-3 h-3" /> Cluster {ci + 1}</span>
                                      <span className="text-[11px] font-bold text-slate-800">{cluster.items.length} {cluster.items.length === 1 ? 'idea' : 'similar ideas'}</span>
                                      {isSimilarCluster && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-700 text-white flex items-center gap-1"><Link2 className="w-3 h-3" /> Similar</span>}
                                      {cluster.topBadge && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">{cluster.topBadge}</span>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">👍 {cluster.totalVotes}</span>
                                      {cluster.avgRating > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-amber-200 text-amber-700">★ {cluster.avgRating.toFixed(1)}</span>}
                                      {unratedCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">⏳ {unratedCount} unrated</span>}
                                      {hiddenCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">🙈 {hiddenCount} hidden</span>}
                                    </div>
                                  </button>
                                  {isExpanded && (
                                    <div className="px-3 pb-3 pt-1 border-t border-black/5">
                                      <div className="flex flex-wrap items-center gap-2 p-2 mb-3 bg-white/80 rounded-lg border border-slate-200">
                                        <span className="text-[10px] font-bold text-slate-600">⚡ Bulk:</span>
                                        <button onClick={() => handleBulkRateCluster(cluster, 5)} className="text-[10px] font-bold px-2 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white transition">★ 5 all</button>
                                        <button onClick={() => handleBulkRateCluster(cluster, 4)} className="text-[10px] font-bold px-2 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white transition">★ 4 all</button>
                                        <button onClick={() => handleBulkRateCluster(cluster, 3)} className="text-[10px] font-bold px-2 py-1 rounded-md bg-slate-500 hover:bg-slate-600 text-white transition">★ 3 all</button>
                                        <span className="mx-1 text-slate-300">|</span>
                                        <select onChange={(e) => { if (e.target.value) { handleBulkBadgeCluster(cluster, e.target.value); e.target.value = ''; } }} defaultValue="" className="text-[10px] font-bold border border-slate-200 rounded px-1.5 py-1 bg-white">
                                          <option value="">🏆 Bulk Badge...</option>
                                          <option value="Best Solution ⭐">Best Solution ⭐</option>
                                          <option value="Most Creative 💡">Most Creative 💡</option>
                                          <option value="Top Policy 📜">Top Policy 📜</option>
                                        </select>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {cluster.items.map(idea => {
                                          const dev = getDevelopment(idea.id);
                                          const stageObj = dev ? DEVELOPMENT_STAGES.find(s => s.key === dev.stage) : null;
                                          const isHidden = idea.visibleToStudents === false;
                                          const isTeacherOnly = idea.teacherOnly === true;
                                          return (
                                            <div key={idea.id} className={`p-3.5 rounded-xl border bg-white text-xs flex flex-col justify-between space-y-3 shadow-sm ${isHidden ? 'border-red-300 ring-1 ring-red-200' : isTeacherOnly ? 'border-purple-300 ring-1 ring-purple-200' : 'border-slate-200'}`}>
                                              <div>
                                                <div className="flex justify-between items-center mb-1.5 gap-1 flex-wrap">
                                                  <span className="font-bold text-indigo-900">{idea.studentName} ({idea.groupName})</span>
                                                  <div className="flex items-center gap-1 flex-wrap">
                                                    {isTeacherOnly && <span className="text-[9px] font-bold bg-purple-700 text-white px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" /> Teacher only</span>}
                                                    {isHidden && <span className="text-[9px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><EyeOff className="w-2.5 h-2.5" /> Hidden</span>}
                                                    <span className="text-[10px] font-semibold bg-slate-200 px-1.5 py-0.5 rounded text-slate-700">{idea.tag}</span>
                                                  </div>
                                                </div>
                                                <p className="text-slate-700 font-medium">{idea.content}</p>
                                                {cluster.items.length > 1 && clusterSimilarityMap[idea.id]?.similarTo.length > 0 && (
                                                  <div className="mt-2 text-[10px] text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-md px-2 py-1.5">
                                                    <p className="font-bold flex items-center gap-1"><Link2 className="w-3 h-3" /> Similar to {clusterSimilarityMap[idea.id].similarTo.length} idea{clusterSimilarityMap[idea.id].similarTo.length === 1 ? '' : 's'}:</p>
                                                    <p className="mt-0.5 leading-relaxed">
                                                      {clusterSimilarityMap[idea.id].similarTo.map((s, idx) => (
                                                        <span key={s.id} className="inline-flex items-center gap-0.5 mr-1.5">
                                                          <span className="font-semibold">{s.name}</span>
                                                          <span className="text-indigo-500">({Math.round(s.sim * 100)}%)</span>
                                                          {idx < clusterSimilarityMap[idea.id].similarTo.length - 1 && ','}
                                                        </span>
                                                      ))}
                                                    </p>
                                                  </div>
                                                )}
                                              </div>

                                              <div className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50">
                                                <span className="text-[10px] font-bold text-slate-500">{idea.visibleToStudents === false ? '🙈 Hidden from students' : '👁️ Visible to students'}</span>
                                                <button onClick={() => handleToggleIdeaVisibility(idea.id)} className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-md border transition ${idea.visibleToStudents === false ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}>{idea.visibleToStudents === false ? <><EyeOff className="w-3 h-3" /> Show</> : <><Eye className="w-3 h-3" /> Hide</>}</button>
                                              </div>

                                              <div className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50">
                                                <div className="flex flex-wrap items-center gap-1">
                                                  {dev && stageObj ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${stageObj.cls}`}>{stageObj.emoji} {stageObj.label}</span> : <span className="text-[10px] font-bold text-slate-400 italic">Not assigned</span>}
                                                </div>
                                                <button onClick={() => handleOpenDevelop(idea)} className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-md border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 transition"><Rocket className="w-3 h-3" /> {dev ? 'Update Task' : 'Assign Task'}</button>
                                              </div>

                                              <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                                                <div className="flex items-center justify-between">
                                                  <span className="text-[10px] font-bold text-slate-500">Rate:</span>
                                                  <div className="flex gap-1">{[1, 2, 3, 4, 5].map(star => (<button key={star} onClick={() => handleRateIdea(idea.id, star)} className={`text-xs ${idea.rating >= star ? 'text-amber-500' : 'text-slate-300'}`}>★</button>))}</div>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                  <span className="text-[10px] font-bold text-slate-500">Badge:</span>
                                                  <select value={idea.badge || ''} onChange={(e) => handleSetBadge(idea.id, e.target.value)} className="text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white">
                                                    <option value="">None</option>
                                                    <option value="Best Solution ⭐">Best Solution ⭐</option>
                                                    <option value="Most Creative 💡">Most Creative 💡</option>
                                                    <option value="Top Policy 📜">Top Policy 📜</option>
                                                  </select>
                                                </div>
                                              </div>
                                              {idea.teacherReply && (editing === 'ti:' + idea.id ? <InlineEdit initial={idea.teacherReply} names={mentionNames} onSave={(v) => handleEditTeacherReply('ideas', idea.id, v)} onCancel={() => setEditing(null)} /> : <div className="p-1.5 bg-emerald-50 border border-emerald-200 rounded text-[11px] text-slate-700"><span className="font-bold text-emerald-700">Your feedback: </span><MentionText text={idea.teacherReply} names={mentionNames} />{idea.teacherReplyEdited && <span className="text-[9px] text-slate-400"> (edited)</span>}<ActionBtns canEdit canDelete onEdit={() => setEditing('ti:' + idea.id)} onDelete={() => handleDeleteTeacherReply('ideas', idea.id)} /></div>)}
<div className="flex gap-1">
                                                <MentionInput placeholder="Feedback reply... (@ to mention)" value={replyTextMap[idea.id] || ''} onChange={(v) => setReplyTextMap({ ...replyTextMap, [idea.id]: v })} names={mentionNames} onEnter={() => handleReplyToIdea(idea.id)} className="text-[11px] px-2 py-1 border border-slate-200 rounded bg-white focus:outline-none" />
                                                <button onClick={() => handleReplyToIdea(idea.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] px-2 py-1 rounded transition">Reply</button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col">
                        <h3 className="font-bold text-slate-800 text-sm pb-3 border-b border-slate-100 mb-3 flex items-center gap-2"><HelpCircle className="w-4 h-4 text-indigo-600" /> Student Questions ({probQuestions.length})</h3>
                        <div className="space-y-3 flex-1 overflow-y-auto max-h-[300px]">
                          {probQuestions.length === 0 && (
                            <p className="text-[11px] text-slate-400 italic text-center py-4">No student questions for this problem yet.</p>
                          )}
                          {probQuestions.map(pc => (
                            <div key={pc.id} className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs">
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-bold text-indigo-950">{pc.studentName}</span>
                                <span className="text-[10px] text-slate-400">{pc.time}{pc.edited && ' • edited'}<ActionBtns canDelete onDelete={() => handleDeleteQuestion(pc)} /></span>
                              </div>
                              <p className="text-slate-700 mb-2"><MentionText text={pc.text} names={mentionNames} /></p>
                              {pc.teacherReply && (editing === 'tr:' + pc.id ? <InlineEdit initial={pc.teacherReply} names={mentionNames} onSave={(v) => handleEditTeacherReply('problemComments', pc.id, v)} onCancel={() => setEditing(null)} /> : <div className="mb-2 p-1.5 bg-white border border-indigo-200 rounded text-[11px]"><span className="font-bold text-emerald-700">Replied: </span><span className="text-slate-700"><MentionText text={pc.teacherReply} names={mentionNames} /></span>{pc.teacherReplyEdited && <span className="text-[9px] text-slate-400"> (edited)</span>}<ActionBtns canEdit canDelete onEdit={() => setEditing('tr:' + pc.id)} onDelete={() => handleDeleteTeacherReply('problemComments', pc.id)} /></div>)}
                              {(pc.studentReplies || []).length > 0 && (
                                <div className="mb-2 space-y-1">
                                  {pc.studentReplies.map(sr => (<div key={sr.id} className="pl-2 border-l-2 border-indigo-300 text-[11px] text-slate-700"><span className="font-bold text-indigo-700">{sr.studentName}: </span><MentionText text={sr.text} names={mentionNames} />{sr.edited && <span className="text-[9px] text-slate-400"> (edited)</span>}<ActionBtns canDelete onDelete={() => handleDeleteStudentReply(pc, sr)} /></div>))}
                                </div>
                              )}
                              <div className="flex gap-1">
                                <MentionInput placeholder="Reply to student... (@ to mention)" value={replyTextMap[pc.id] || ''} onChange={(v) => setReplyTextMap({ ...replyTextMap, [pc.id]: v })} names={mentionNames} onEnter={() => handleReplyToComment(pc.id)} className="text-[11px] px-2 py-1 border border-indigo-200 rounded bg-white focus:outline-none" />
                                <button onClick={() => handleReplyToComment(pc.id)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] px-2 py-1 rounded transition">Reply</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </section>
        </main>
      )}

      {/* MODALS */}
      {showTeacherModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 mb-1">{editingProblem ? 'Edit Problem' : 'New Problem'}</h3>
            <p className="text-xs text-slate-500 mb-4">Add details and a deadline.</p>
            <form onSubmit={handleSaveProblem} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Problem Title</label>
                <input type="text" required placeholder="e.g. Plastic Pollution Control" value={teacherProblemTitle} onChange={(e) => setTeacherProblemTitle(e.target.value)} className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea rows="3" placeholder="Add instructions..." value={teacherProblemDesc} onChange={(e) => setTeacherProblemDesc(e.target.value)} className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deadline</label>
                <input type="datetime-local" value={teacherProblemDeadline} onChange={(e) => setTeacherProblemDeadline(e.target.value)} className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={teacherProblemPeerVisible} onChange={(e) => setTeacherProblemPeerVisible(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
                  <div><p className="text-xs font-bold text-slate-800">👁️ Students can see each other</p><p className="text-[11px] text-slate-500 mt-0.5">Uncheck for graded work.</p></div>
                </label>
              </div>
              <div className="p-3 rounded-lg border-2 border-cyan-200 bg-cyan-50">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={teacherProblemShared} onChange={(e) => setTeacherProblemShared(e.target.checked)} className="mt-0.5 w-4 h-4 accent-cyan-600" />
                  <div>
                    <p className="text-xs font-bold text-cyan-900 flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> Share with all teachers (view only)</p>
                    <p className="text-[11px] text-cyan-800 mt-0.5">Other teachers will see this problem and its ideas, but only <b>you</b> can edit, rate, give feedback, or assign tasks.</p>
                  </div>
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTeacherModal(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition">{editingProblem ? 'Save Changes' : 'Post Problem'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {developIdea && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><Rocket className="w-4 h-4 text-indigo-600" /> Assign Task</h3>
              <button onClick={() => setDevelopIdea(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 mb-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">{developIdea.studentName} • {developIdea.groupName}</p>
              <p className="text-xs text-slate-700 italic">"{developIdea.content}"</p>
            </div>
            <form onSubmit={handleSaveDevelopment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Task Stage</label>
                <div className="flex flex-wrap gap-1.5">
                  {DEVELOPMENT_STAGES.map(s => (
                    <button key={s.key} type="button" onClick={() => setDevStage(s.key)} className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${devStage === s.key ? 'ring-2 ring-indigo-400 ' + s.cls : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{s.emoji} {s.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assign to Group</label>
                <select value={devGroupId} onChange={(e) => setDevGroupId(e.target.value)} className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
                  <option value="">— No group / whole class —</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Task Instructions / Next Step</label>
                <textarea rows="3" value={devNote} onChange={(e) => setDevNote(e.target.value)} placeholder="e.g. Prepare a cost estimate." className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Date</label>
                <input type="datetime-local" value={devDeadline} onChange={(e) => setDevDeadline(e.target.value)} className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={devVisibleToOthers} onChange={(e) => setDevVisibleToOthers(e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600" />
                  <div><p className="text-xs font-bold text-slate-800">👁️ Visible to other students</p><p className="text-[11px] text-slate-500 mt-0.5">{devVisibleToOthers ? '✅ Everyone can see it' : '🔒 Owner only'}</p><p className="text-[10px] text-indigo-600 mt-1 italic">{developIdea?.studentName} always sees it.</p></div>
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setDevelopIdea(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5"><Rocket className="w-3.5 h-3.5" /> Assign Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAISummary && aiSummary && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2 text-purple-700 font-bold text-base"><Sparkles className="w-5 h-5" /> AI Summary</div>
              <button onClick={() => setShowAISummary(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4 text-xs">
              <div className="bg-purple-50 p-3.5 rounded-xl border border-purple-100">
                <p className="font-bold text-purple-900 text-sm">{aiSummary.problemTitle}</p>
                <p className="text-purple-700 mt-0.5">{aiSummary.totalIdeas} ideas • {aiSummary.totalVotes} upvotes</p>
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-xs mb-2 uppercase tracking-wider text-slate-500">Top Themes</h4>
                <div className="space-y-1.5">
                  {aiSummary.topThemes.map(th => (
                    <div key={th.tag} className="flex items-center gap-2">
                      <span className="w-24 font-semibold text-slate-700">{th.tag}</span>
                      <div className="flex-1 bg-slate-100 h-3 rounded-full overflow-hidden"><div className="bg-purple-600 h-full rounded-full transition-all" style={{ width: `${th.pct}%` }} /></div>
                      <span className="font-bold text-slate-700 text-[11px]">{th.count} ({th.pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-xs mb-2 uppercase tracking-wider text-slate-500">⭐ Top Ideas</h4>
                <div className="space-y-2">
                  {aiSummary.keySolutions.map(ks => (
                    <div key={ks.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-indigo-900">{ks.studentName} ({ks.groupName})</span>
                        <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full">{ks.tag}</span>
                      </div>
                      <p className="text-slate-700 italic">"{ks.content}"</p>
                    </div>
                  ))}
                </div>
              </div>
              {aiSummary.duplicates.length > 0 && (
                <div>
                  <h4 className="font-bold text-amber-800 text-xs mb-2 uppercase tracking-wider">⚠️ Similar Ideas</h4>
                  <div className="space-y-2">
                    {aiSummary.duplicates.map((d, idx) => (
                      <div key={idx} className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-900">
                        <p className="font-bold text-[11px]">{d.similarity}% similar:</p>
                        <p className="mt-1">1. <strong>{d.idea1.studentName}:</strong> "{d.idea1.content}"</p>
                        <p>2. <strong>{d.idea2.studentName}:</strong> "{d.idea2.content}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-5 pt-3 border-t border-slate-200 flex justify-end">
              <button onClick={() => setShowAISummary(false)} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-semibold transition">Close</button>
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}