--
-- PostgreSQL database dump
--

\restrict q5oQQdBzY7g5p6mmcHPFzFuZerlXQnHVXwPBdrlzJEt6Ko8ASLecyD2lJQ7j31L

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: expense_guard(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.expense_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.expense_date > (now() AT TIME ZONE 'Asia/Almaty')::date THEN
        RAISE EXCEPTION 'expense_date % is in the future', NEW.expense_date
            USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (SELECT 1 FROM category
               WHERE id = NEW.category_id AND is_archived) THEN
        NEW.status := 'Needs review';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END $$;


ALTER FUNCTION public.expense_guard() OWNER TO postgres;

--
-- Name: income_guard(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.income_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.income_date > (now() AT TIME ZONE 'Asia/Almaty')::date THEN
        RAISE EXCEPTION 'income_date % is in the future', NEW.income_date
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;


ALTER FUNCTION public.income_guard() OWNER TO postgres;

--
-- Name: transfer_budget(bigint, bigint, bigint, integer, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.transfer_budget(p_actor_user_id bigint, p_from_limit_id bigint, p_to_limit_id bigint, p_amount integer, p_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_from_amount  integer;
    v_to_amount    integer;
    v_from_family  bigint;
    v_to_family    bigint;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'transfer amount must be positive';
    END IF;
    IF p_from_limit_id = p_to_limit_id THEN
        RAISE EXCEPTION 'source and target limits must differ';
    END IF;

    PERFORM 1 FROM monthly_limit
    WHERE id IN (p_from_limit_id, p_to_limit_id)
    ORDER BY id
    FOR UPDATE;

    SELECT limit_amount, family_id INTO v_from_amount, v_from_family
    FROM monthly_limit WHERE id = p_from_limit_id;
    SELECT limit_amount, family_id INTO v_to_amount, v_to_family
    FROM monthly_limit WHERE id = p_to_limit_id;

    IF v_from_amount IS NULL OR v_to_amount IS NULL THEN
        RAISE EXCEPTION 'limit not found';
    END IF;
    IF v_from_family <> v_to_family THEN
        RAISE EXCEPTION 'limits belong to different families';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM family_member
                   WHERE family_id = v_from_family
                     AND user_id = p_actor_user_id
                     AND role = 'Admin') THEN
        RAISE EXCEPTION 'only a family Admin can transfer budget';
    END IF;
    IF v_from_amount - p_amount <= 0 THEN
        RAISE EXCEPTION 'source limit must stay positive';
    END IF;

    UPDATE monthly_limit SET limit_amount = v_from_amount - p_amount WHERE id = p_from_limit_id;
    UPDATE monthly_limit SET limit_amount = v_to_amount   + p_amount WHERE id = p_to_limit_id;

    INSERT INTO limit_change_log (monthly_limit_id, actor_user_id, old_amount, new_amount, reason)
    VALUES (p_from_limit_id, p_actor_user_id, v_from_amount, v_from_amount - p_amount, p_reason),
           (p_to_limit_id,   p_actor_user_id, v_to_amount,   v_to_amount   + p_amount, p_reason);
END $$;


ALTER FUNCTION public.transfer_budget(p_actor_user_id bigint, p_from_limit_id bigint, p_to_limit_id bigint, p_amount integer, p_reason text) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_user; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_user (
    id bigint NOT NULL,
    email text NOT NULL,
    full_name text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_user_email_check CHECK ((POSITION(('@'::text) IN (email)) > 1)),
    CONSTRAINT app_user_full_name_check CHECK ((length(btrim(full_name)) > 0))
);


ALTER TABLE public.app_user OWNER TO postgres;

--
-- Name: app_user_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.app_user ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.app_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: category; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.category (
    id bigint NOT NULL,
    family_id bigint NOT NULL,
    name text NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT category_name_check CHECK ((length(btrim(name)) > 0))
);


ALTER TABLE public.category OWNER TO postgres;

--
-- Name: category_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.category ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.category_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: expense; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.expense (
    id bigint NOT NULL,
    family_id bigint NOT NULL,
    author_user_id bigint NOT NULL,
    category_id bigint NOT NULL,
    amount integer NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    expense_date date NOT NULL,
    status text DEFAULT 'Approved'::text NOT NULL,
    client_request_id uuid NOT NULL,
    receipt_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expense_amount_check CHECK (((amount >= 1) AND (amount <= 10000000))),
    CONSTRAINT expense_status_check CHECK ((status = ANY (ARRAY['Approved'::text, 'Needs review'::text])))
);


ALTER TABLE public.expense OWNER TO postgres;

--
-- Name: expense_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.expense ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.expense_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: family; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.family (
    id bigint NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT family_name_check CHECK ((length(btrim(name)) > 0))
);


ALTER TABLE public.family OWNER TO postgres;

--
-- Name: family_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.family ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.family_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: family_member; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.family_member (
    family_id bigint NOT NULL,
    user_id bigint NOT NULL,
    role text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT family_member_role_check CHECK ((role = ANY (ARRAY['Admin'::text, 'Member'::text])))
);


ALTER TABLE public.family_member OWNER TO postgres;

--
-- Name: income; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.income (
    id bigint NOT NULL,
    family_id bigint NOT NULL,
    author_user_id bigint NOT NULL,
    amount integer NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    income_date date NOT NULL,
    client_request_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT income_amount_check CHECK (((amount >= 1) AND (amount <= 10000000)))
);


ALTER TABLE public.income OWNER TO postgres;

--
-- Name: income_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.income ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.income_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: limit_change_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.limit_change_log (
    id bigint NOT NULL,
    monthly_limit_id bigint NOT NULL,
    actor_user_id bigint NOT NULL,
    old_amount integer,
    new_amount integer NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text,
    CONSTRAINT limit_change_log_new_amount_check CHECK ((new_amount > 0)),
    CONSTRAINT limit_change_log_old_amount_check CHECK (((old_amount IS NULL) OR (old_amount > 0)))
);


ALTER TABLE public.limit_change_log OWNER TO postgres;

--
-- Name: limit_change_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.limit_change_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.limit_change_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: monthly_limit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.monthly_limit (
    id bigint NOT NULL,
    family_id bigint NOT NULL,
    category_id bigint NOT NULL,
    month character(7) NOT NULL,
    limit_amount integer NOT NULL,
    CONSTRAINT monthly_limit_limit_amount_check CHECK ((limit_amount > 0)),
    CONSTRAINT monthly_limit_month_check CHECK ((month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'::text))
);


ALTER TABLE public.monthly_limit OWNER TO postgres;

--
-- Name: monthly_limit_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.monthly_limit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.monthly_limit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: v_monthly_budget; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_monthly_budget AS
 WITH months AS (
         SELECT monthly_limit.category_id,
            monthly_limit.month
           FROM public.monthly_limit
        UNION
         SELECT expense.category_id,
            to_char((expense.expense_date)::timestamp with time zone, 'YYYY-MM'::text) AS to_char
           FROM public.expense
          WHERE (expense.status = 'Approved'::text)
        )
 SELECT c.family_id,
    c.id AS category_id,
    c.name AS category,
    c.is_archived,
    mo.month,
    ml.limit_amount AS planned,
    COALESCE(sum(e.amount), (0)::bigint) AS spent,
    (ml.limit_amount - COALESCE(sum(e.amount), (0)::bigint)) AS remaining
   FROM (((public.category c
     JOIN months mo ON ((mo.category_id = c.id)))
     LEFT JOIN public.monthly_limit ml ON (((ml.category_id = c.id) AND (ml.month = mo.month))))
     LEFT JOIN public.expense e ON (((e.category_id = c.id) AND (e.status = 'Approved'::text) AND (to_char((e.expense_date)::timestamp with time zone, 'YYYY-MM'::text) = (mo.month)::text))))
  GROUP BY c.family_id, c.id, c.name, c.is_archived, mo.month, ml.limit_amount;


ALTER VIEW public.v_monthly_budget OWNER TO postgres;

--
-- Data for Name: app_user; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.app_user (id, email, full_name, password_hash, created_at) FROM stdin;
1	aigerim@example.com	Aigerim	REPLACE_WITH_ARGON2_HASH	2026-11-05 14:16:40.85688+05
2	daulet@example.com	Daulet	REPLACE_WITH_ARGON2_HASH	2026-11-05 14:16:40.85688+05
3	aruzhan@example.com	Aruzhan	REPLACE_WITH_ARGON2_HASH	2026-11-05 14:16:40.85688+05
\.


--
-- Data for Name: category; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.category (id, family_id, name, is_archived, created_at) FROM stdin;
1	1	Food	f	2026-11-05 14:16:40.85688+05
2	1	Transport	f	2026-11-05 14:16:40.85688+05
3	1	Utilities	f	2026-11-05 14:16:40.85688+05
4	1	Health	f	2026-11-05 14:16:40.85688+05
5	1	Entertainment	f	2026-11-05 14:16:40.85688+05
\.


--
-- Data for Name: expense; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.expense (id, family_id, author_user_id, category_id, amount, description, expense_date, status, client_request_id, receipt_path, created_at, updated_at) FROM stdin;
1	1	3	1	14500	Market and bakery	2026-10-20	Approved	59cc7877-dbf7-403d-a28e-d62659dd8aa5	\N	2026-11-05 14:16:40.85688+05	2026-11-05 14:16:40.85688+05
2	1	2	1	18400	Supermarket	2026-10-12	Approved	9ab29418-6c75-476d-9ba3-18a53bc77583	\N	2026-11-05 14:16:40.85688+05	2026-11-05 14:16:40.85688+05
3	1	1	1	20000	Weekly groceries	2026-10-03	Approved	51e56a8e-08a4-4d29-a8b1-07b934ab61ee	\N	2026-11-05 14:16:40.85688+05	2026-11-05 14:16:40.85688+05
4	1	2	2	8000	Monthly bus pass	2026-10-01	Approved	cfb23f98-9ddd-4875-94af-22f73684385d	\N	2026-11-05 14:16:40.85688+05	2026-11-05 14:16:40.85688+05
5	1	1	2	4900	Taxi	2026-10-15	Approved	09c3ccdd-038b-4425-8b26-526ec6e753ac	\N	2026-11-05 14:16:40.85688+05	2026-11-05 14:16:40.85688+05
6	1	1	3	22000	Electricity and heating	2026-10-05	Approved	00efea98-8607-46a3-939a-460363e06452	\N	2026-11-05 14:16:40.85688+05	2026-11-05 14:16:40.85688+05
7	1	1	3	9500	Internet and phone	2026-10-06	Approved	11e2c35c-66de-4ddb-b637-006ce71797fc	\N	2026-11-05 14:16:40.85688+05	2026-11-05 14:16:40.85688+05
8	1	3	4	4200	Pharmacy	2026-10-09	Approved	449ab393-d3e8-453c-a618-3ce06785081a	\N	2026-11-05 14:16:40.85688+05	2026-11-05 14:16:40.85688+05
9	1	3	5	900	Books	2026-10-25	Approved	b1c3d9da-83d1-4b70-988d-6dbfc86a41c6	\N	2026-11-05 14:16:40.85688+05	2026-11-05 14:16:40.85688+05
10	1	2	5	1500	Cinema	2026-10-18	Approved	1aff896e-1aa0-4551-a7f8-612af5bcba7b	\N	2026-11-05 14:16:40.85688+05	2026-11-05 14:16:40.85688+05
\.


--
-- Data for Name: family; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.family (id, name, created_at) FROM stdin;
1	Demo Family	2026-11-05 14:16:40.85688+05
\.


--
-- Data for Name: family_member; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.family_member (family_id, user_id, role, joined_at) FROM stdin;
1	1	Admin	2026-11-05 14:16:40.85688+05
1	2	Member	2026-11-05 14:16:40.85688+05
1	3	Member	2026-11-05 14:16:40.85688+05
\.


--
-- Data for Name: income; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.income (id, family_id, author_user_id, amount, description, income_date, client_request_id, created_at) FROM stdin;
1	1	1	400000	Salary	2026-10-01	e8bf7720-6713-4fb2-9023-6e195ab29149	2026-11-05 14:16:40.85688+05
2	1	1	100000	Side income	2026-10-10	fd50b298-67e6-4e86-9575-6bc4c3782cc5	2026-11-05 14:16:40.85688+05
\.


--
-- Data for Name: limit_change_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.limit_change_log (id, monthly_limit_id, actor_user_id, old_amount, new_amount, changed_at, reason) FROM stdin;
\.


--
-- Data for Name: monthly_limit; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.monthly_limit (id, family_id, category_id, month, limit_amount) FROM stdin;
1	1	1	2026-10	60000
2	1	2	2026-10	30000
3	1	3	2026-10	40000
4	1	4	2026-10	15000
5	1	5	2026-10	15000
\.


--
-- Name: app_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.app_user_id_seq', 3, true);


--
-- Name: category_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.category_id_seq', 5, true);


--
-- Name: expense_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.expense_id_seq', 10, true);


--
-- Name: family_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.family_id_seq', 1, true);


--
-- Name: income_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.income_id_seq', 2, true);


--
-- Name: limit_change_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.limit_change_log_id_seq', 1, false);


--
-- Name: monthly_limit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.monthly_limit_id_seq', 5, true);


--
-- Name: app_user app_user_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (id);


--
-- Name: category category_id_family_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_id_family_id_key UNIQUE (id, family_id);


--
-- Name: category category_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_pkey PRIMARY KEY (id);


--
-- Name: expense expense_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expense
    ADD CONSTRAINT expense_pkey PRIMARY KEY (id);


--
-- Name: family_member family_member_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.family_member
    ADD CONSTRAINT family_member_pkey PRIMARY KEY (family_id, user_id);


--
-- Name: family family_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.family
    ADD CONSTRAINT family_pkey PRIMARY KEY (id);


--
-- Name: income income_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.income
    ADD CONSTRAINT income_pkey PRIMARY KEY (id);


--
-- Name: limit_change_log limit_change_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.limit_change_log
    ADD CONSTRAINT limit_change_log_pkey PRIMARY KEY (id);


--
-- Name: monthly_limit monthly_limit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.monthly_limit
    ADD CONSTRAINT monthly_limit_pkey PRIMARY KEY (id);


--
-- Name: expense uq_expense_client_request; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expense
    ADD CONSTRAINT uq_expense_client_request UNIQUE (client_request_id);


--
-- Name: income uq_income_client_request; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.income
    ADD CONSTRAINT uq_income_client_request UNIQUE (client_request_id);


--
-- Name: monthly_limit uq_limit_category_month; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.monthly_limit
    ADD CONSTRAINT uq_limit_category_month UNIQUE (category_id, month);


--
-- Name: ix_expense_author; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_expense_author ON public.expense USING btree (family_id, author_user_id);


--
-- Name: ix_expense_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_expense_category ON public.expense USING btree (category_id);


--
-- Name: ix_expense_family_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_expense_family_date ON public.expense USING btree (family_id, expense_date);


--
-- Name: ix_family_member_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_family_member_user ON public.family_member USING btree (user_id);


--
-- Name: ix_income_family_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_income_family_date ON public.income USING btree (family_id, income_date);


--
-- Name: ix_limit_log_limit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_limit_log_limit ON public.limit_change_log USING btree (monthly_limit_id, changed_at);


--
-- Name: ux_app_user_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_app_user_email ON public.app_user USING btree (lower(email));


--
-- Name: ux_category_family_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_category_family_name ON public.category USING btree (family_id, lower(name));


--
-- Name: expense trg_expense_guard; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_expense_guard BEFORE INSERT OR UPDATE ON public.expense FOR EACH ROW EXECUTE FUNCTION public.expense_guard();


--
-- Name: income trg_income_guard; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_income_guard BEFORE INSERT OR UPDATE ON public.income FOR EACH ROW EXECUTE FUNCTION public.income_guard();


--
-- Name: category category_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.family(id) ON DELETE CASCADE;


--
-- Name: expense expense_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expense
    ADD CONSTRAINT expense_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.family(id) ON DELETE CASCADE;


--
-- Name: family_member family_member_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.family_member
    ADD CONSTRAINT family_member_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.family(id) ON DELETE CASCADE;


--
-- Name: family_member family_member_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.family_member
    ADD CONSTRAINT family_member_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;


--
-- Name: expense fk_expense_author; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expense
    ADD CONSTRAINT fk_expense_author FOREIGN KEY (family_id, author_user_id) REFERENCES public.family_member(family_id, user_id);


--
-- Name: expense fk_expense_category; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expense
    ADD CONSTRAINT fk_expense_category FOREIGN KEY (category_id, family_id) REFERENCES public.category(id, family_id);


--
-- Name: income fk_income_author; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.income
    ADD CONSTRAINT fk_income_author FOREIGN KEY (family_id, author_user_id) REFERENCES public.family_member(family_id, user_id);


--
-- Name: monthly_limit fk_limit_category; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.monthly_limit
    ADD CONSTRAINT fk_limit_category FOREIGN KEY (category_id, family_id) REFERENCES public.category(id, family_id) ON DELETE CASCADE;


--
-- Name: income income_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.income
    ADD CONSTRAINT income_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.family(id) ON DELETE CASCADE;


--
-- Name: limit_change_log limit_change_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.limit_change_log
    ADD CONSTRAINT limit_change_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.app_user(id);


--
-- Name: limit_change_log limit_change_log_monthly_limit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.limit_change_log
    ADD CONSTRAINT limit_change_log_monthly_limit_id_fkey FOREIGN KEY (monthly_limit_id) REFERENCES public.monthly_limit(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict q5oQQdBzY7g5p6mmcHPFzFuZerlXQnHVXwPBdrlzJEt6Ko8ASLecyD2lJQ7j31L

