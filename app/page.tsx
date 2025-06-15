'use client';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { User } from '@supabase/supabase-js';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Task = {
  id: string;
  content: string;
  completed: boolean;
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (data.user && isMounted) setUser(data.user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) setUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    let ignore = false;

    supabase
      .from('tasks')
      .select('*')
      .eq('owner_id', user.id)
      .then(({ data }) => {
        if (!ignore) setTasks(data || []);
      });

    const channel = supabase
      .channel('realtime:tasks')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `owner_id=eq.${user.id}`,
        },
        (payload) => {
          const task = payload.new as Task;
          setTasks((prev) => {
            const without = prev.filter((t) => t.id !== task.id);
            return [...without, task];
          });
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const addTask = async () => {
    if (!text.trim() || !user) return;
    const { data } = await supabase.from('tasks').insert({
      content: text.trim(),
      owner_id: user.id,
    }).select();

    if (data && data[0]) {
      setTasks((prev) => [...prev, data[0]]);
    }

    setText('');
  };

  const toggleTask = async (id: string, completed: boolean) => {
    const { data } = await supabase
      .from('tasks')
      .update({ completed })
      .eq('id', id)
      .select();

    if (data && data[0]) {
      setTasks((prev) =>
        prev.map((task) => (task.id === id ? { ...task, completed } : task))
      );
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const login = async () => {
    const email = prompt('Enter your email:');
    if (!email) return;
    await supabase.auth.signInWithOtp({ email });
    alert('Check your email for the magic login link.');
  };

  return (
    <div style={{
      padding: '2rem',
      maxWidth: 600,
      margin: 'auto',
      fontFamily: 'Segoe UI, sans-serif',
      backgroundColor: '#f9f9f9',
      borderRadius: '8px',
      boxShadow: '0 0 10px rgba(0,0,0,0.08)',
      marginTop: '4rem',
    }}>
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>📝 QuickSync List</h1>
        {!user && <p style={{ color: '#555' }}>Sign in to continue</p>}
        {!user && (
          <button
            onClick={login}
            style={{
              padding: '10px 20px',
              borderRadius: '5px',
              border: 'none',
              backgroundColor: '#2d72fc',
              color: '#fff',
              cursor: 'pointer',
              marginTop: '10px',
            }}
          >
            Sign In with Email
          </button>
        )}
      </header>

      {user && (
        <>
          <button
            onClick={logout}
            style={{
              float: 'right',
              padding: '5px 15px',
              border: '1px solid #ccc',
              backgroundColor: '#fff',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '1rem',
            }}
          >
            Logout
          </button>

          <div style={{ display: 'flex', marginBottom: '1.5rem' }}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a new task..."
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '4px',
                border: '1px solid #ccc',
              }}
            />
            <button
              onClick={addTask}
              style={{
                marginLeft: '10px',
                padding: '10px 20px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Add
            </button>
          </div>

          <ul style={{ listStyle: 'none', padding: 0 }}>
            {tasks.map((task) => (
              <li key={task.id} style={{ marginBottom: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={(e) => toggleTask(task.id, e.target.checked)}
                    style={{ marginRight: '10px' }}
                  />
                  <span
                    style={{
                      textDecoration: task.completed ? 'line-through' : 'none',
                      color: task.completed ? '#888' : '#222',
                    }}
                  >
                    {task.content}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      <footer style={{
        marginTop: '2rem',
        paddingTop: '1rem',
        borderTop: '1px solid #eaeaea',
        fontSize: '0.85rem',
        textAlign: 'center',
        color: '#888',
      }}>
        Developed by Vibhu © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
