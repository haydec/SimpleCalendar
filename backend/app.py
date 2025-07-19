from flask import Flask, request, jsonify
from flask_cors import CORS
from pyomo.environ import *
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

people = ["Alice", "Bob", "Charlie", "Dana", "Eve"]
assignments = []

# Filled by /calendar‑settings
calendar_config = {
    "start_date": None,
    "end_date":   None,
    "holidays":   set(),
    "weekends":   set(),
    "cage_days":  set(),
}

# ---------- utility ---------- #
def cost_fn(d):
    """Return cost weight for a date."""
    if d in calendar_config["cage_days"]:
        return 1                        # easiest
    if d in calendar_config["holidays"] or d in calendar_config["weekends"]:
        return 3                        # harder
    return 1


# ---------- routes ---------- #
@app.route("/generate-schedule")
def generate_schedule():
    print("Generate Schedule")
    print("Calendar Config", calendar_config)
    if not (calendar_config["start_date"] and calendar_config["end_date"]):
        return jsonify({"error": "Calendar settings not received yet."}), 400

    start_date = datetime.strptime(calendar_config["start_date"], "%Y-%m-%d").date()
    end_date   = datetime.strptime(calendar_config["end_date"],   "%Y-%m-%d").date()

    # inclusive range  ➜ +1
    days = [start_date + timedelta(days=i)
            for i in range((end_date - start_date).days + 1)]

    # ----- Pyomo model ----- #
    m = ConcreteModel()
    m.P = Set(initialize=people)
    m.D = Set(initialize=days)
    m.x = Var(m.P, m.D, domain=Binary)

    m.cost = Objective(expr=sum(cost_fn(d) * m.x[p, d] for p in m.P for d in m.D),
                       sense=minimize)

    # one person per day
    for d in m.D:
        m.add_component(f"per_day_{d}",
                        Constraint(expr=sum(m.x[p, d] for p in m.P) == 1))

    # no consecutive days
    sorted_days = sorted(m.D)
    for d1, d2 in zip(sorted_days, sorted_days[1:]):
        for p in m.P:
            m.add_component(f"no_consec_{p}_{d1}",
                            Constraint(expr=m.x[p, d1] + m.x[p, d2] <= 1))

    # equal total days
    base, rem = divmod(len(days), len(people))
    for i, p in enumerate(people):
        total = sum(m.x[p, d] for d in m.D)
        m.add_component(f"equal_total_{p}",
                        Constraint(expr=total == (base + 1 if i < rem else base)))

    # equal hard‑days
    raw_hard = (calendar_config["holidays"]
                | calendar_config["weekends"]
                | calendar_config["cage_days"])
    hard_days = {d for d in raw_hard if d in m.D}

    h_base, h_rem = divmod(len(hard_days), len(people))
    for i, p in enumerate(people):
        h_total = sum(m.x[p, d] for d in hard_days)
        m.add_component(f"equal_hard_{p}",
                        Constraint(expr=h_total == (h_base + 1 if i < h_rem else h_base)))

    SolverFactory("highs").solve(m)

    global assignments
    assignments = [
        {"title": p, "date": d.strftime("%Y-%m-%d")}
        for d in days for p in people
        if value(m.x[p, d]) > 0.5
    ]
    return jsonify(assignments)


@app.route("/update-assignment", methods=["POST"])
def update_assignment():
    data = request.json
    for a in assignments:
        if a["date"] == data["date"]:
            a["title"] = data["title"]
    return jsonify({"status": "updated"})


@app.route("/calendar-settings", methods=["POST"])
def calendar_settings():
    data = request.get_json()
    try:
        calendar_config["start_date"] = data["start_date"]
        calendar_config["end_date"]   = data["end_date"]
        parse = lambda lst: {datetime.strptime(d, "%Y-%m-%d").date() for d in lst}
        calendar_config["weekends"]   = parse(data["weekends"])
        calendar_config["holidays"]   = parse(data["holidays"])
        calendar_config["cage_days"]  = parse(data["cage_days"])
        return jsonify({"status": "OK"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


if __name__ == "__main__":
    app.run(debug=True)
