using Graphs
using Random

model_dir = "../model/"
include("$model_dir/problem.jl")
include("$model_dir/utils.jl")

IMAGES = [
    "static/images/Animal1.png"
    "static/images/Animal2.png"
    "static/images/Animal3.png"
    "static/images/Object1.png"
    "static/images/Object2.png"
    "static/images/Object3.png"
    "static/images/Food1.png"
    "static/images/Food2.png"
    "static/images/Food3.png"
]
parse_features(img) = split(rsplit(img, "/")[end], "_")[1:3]
CATEGORIES = [1,1,1,2,2,2,3,3,3]
CATEGORY_NAMES = ["Animal", "Object", "Food"]

using Distributions
D_GOOD = DiscreteNonParametric([1,2,4], [2/5, 2/5, 1/5])
D_BAD = DiscreteNonParametric([-1,-2,-4], [1/3, 1/3, 1/3])

function describe_mask(mask)
    lookup = [
        Dict(true => "Animal", false => "Object"),
        Dict(true => "Sea", false => "Land"),
        Dict(true => "Solid", false => "Pattern"),
    ]
    items = map(1:3, mask) do i, m
        ismissing(m) && return missing
        lookup[i][m]
    end |> skipmissing
    join(items, " & ")
end

# function default_graph_requirement(sgraph)
#     is_connected(sgraph) || return false
#     # all(vertices(sgraph)) do v
#     #     length(neighbors(sgraph, v)) ≥ 1
#     # end
# end

# function sample_graph(n; d=3, requirement=default_graph_requirement)
#     for i in 1:10000
#         sgraph = expected_degree_graph(fill(d, n)) |> random_orientation_dag
#         # sgraph = expected_degree_graph(fill(2, n))
#         requirement(sgraph) && return neighbor_list(sgraph)
#     end
#     error("Can't sample a graph!")
# end

neighbor_list(sgraph) = neighbors.(Ref(sgraph), vertices(sgraph))

"Adjacency list representation of the tree with specified branching at each depth"
AdjacenyList = Vector{Vector{Int}}
function regular_tree(branching::Vector{Int})
    t = AdjacenyList()
    function rec!(d)
        children = Int[]
        push!(t, children)
        idx = length(t)
        if d <= length(branching)
            for i in 1:branching[d]
                child = rec!(d+1)
                push!(children, child)
            end
        end
        return idx
    end
    rec!(1)
    t
end

empty_tree = AdjacenyList([[]])

function tree_join(g1, g2)
    n1 = length(g1)

    g1 = map(x -> x .+ 1, g1)
    g2 = map(x -> x .+ 1 .+ n1, g2)

    [[[2, n1+2]]; g1; g2]
end

function random_tree(splits)
    splits == 0 && return empty_tree
    splits == 1 && return tree_join(empty_tree, empty_tree)
    left = rand(0:splits-1)
    right = splits-1 - left
    tree_join(random_tree(left), random_tree(right))
end

function sample_graph(n; start=1)
    @assert !iseven(n)
    # base = [[2, 3], [4, 5], [6, 7], [], [], [], []]
    base = random_tree(div(n, 2))
    perm = randperm(length(base))
    # perm[i] = j means node j goes to position i
    i = findfirst(isequal(1), perm)
    perm[start], perm[i] = 1, perm[start]
    graph = map(base[perm]) do x
        Int[findfirst(isequal(i), perm) for i in x]
    end
    graph
end

function linear_rewards(n)
    @assert iseven(n)
    n2 = div(n,2)
    [-n2:1:-1; 1:1:n2]
end

function exponential_rewards(n; base=2)
    # @assert iseven(n)
    n2 = div(n,2)
    v = base .^ (0:1:n2-1)
    if iseven(n)
        sort!([-v; v])
    else
        sort!([-v; 0; v])
    end
end

struct Shuffler{T}
    x::Vector{T}
end

function Random.rand(rng::AbstractRNG, s::Random.SamplerTrivial{<:Shuffler})
    shuffle(s[].x)
end

struct IIDSampler{T}
    n::Int
    x::Vector{T}
end

function Random.rand(rng::AbstractRNG, s::Random.SamplerTrivial{<:IIDSampler})
    (;n, x) = s[]
    rand(x, n)
end

function sample_trial(perm; v_good=rand(D_GOOD), v_bad=rand(D_BAD), revealed=true, kws...)
    c_good, c_bad, c_zero = shuffle(1:3)

    good = findall(isequal(c_good), CATEGORIES[perm])
    bad = findall(isequal(c_bad), CATEGORIES[perm])

    rewards = zeros(Int, length(perm))
    rewards[good] .= v_good
    rewards[bad] .= v_bad

    start = rand(findall(isequal(c_zero), CATEGORIES[perm]))
    rewards[start] = 0

    graph = sample_graph(length(perm); start)
    for es in graph
        es .-= 1
    end
    graph
    (;
        start = start-1, graph, rewards, revealed,
        reward_info = (
            (;val=v_good, desc=CATEGORY_NAMES[c_good], targets=good .- 1),
            (;val=v_bad, desc=CATEGORY_NAMES[c_bad], targets=bad .- 1)
        ),
        kws...
    )
end

function trial2problem(t)
    graph = map(t.graph) do es
        es .+ 1
    end
    Problem(graph, t.rewards, t.start+1, -1)
end

function intro_trial(perm; reward, kws...)
    for i in 1:10000
        t = sample_trial(perm; kws...)
        prob = trial2problem(t)
        minimum(length, paths(prob)) == 2 || continue
        if reward == :posneg
            cat1 = CATEGORIES[perm][prob.graph[prob.start]]
            length(unique(cat1)) == 1 || continue
            is_cat1 = CATEGORIES[perm] .== cat1[1]
            t.rewards .= -1
            t.rewards[is_cat1] .= 2
            all(paths(prob)) do pth
                any(pth) do s
                    t.rewards[s] < 0
                end
            end || continue
            return t
        else
            t.rewards .= 0
            return t
        end
    end
    error("couldn't sample intro_trial")
end


function make_trials(; perm)
    # rdist = IIDSampler(n, rewards)
    (;
        intro = [
            intro_trial(perm; reward=:zero),
            intro_trial(perm; reward=:posneg),
        ],
        intro_describe = [
            sample_trial(perm),
            sample_trial(perm),
            sample_trial(perm),
        ],
        practice_revealed = [sample_trial(perm) for i in 1:3],
        practice_twostage = [sample_trial(perm) for i in 1:3],
        intro_hover = [sample_trial(perm)],
        main_revealed = [sample_trial(perm) for i in 1:200],
        main_hidden = [sample_trial(perm) for i in 1:200],
        # calibration = intro,
        # eyetracking = [sample_problem(;kws..., n_steps) for n_steps in shuffle(repeat(3:5, 7))]
    )
end


# %% --------

mean(make_trials(;perm=1:9).main_revealed) do t
    prob = trial2problem(t)
    # mean(paths(prob)) do pth
    #     value(prob, pth)
    # end
    value(prob)
end
# %% --------

version = "v23"
Random.seed!(hash(version))
# %% --------

dest = "static/json/config"
# rm(dest, recursive=true)
mkpath(dest)
for i in 1:30
    perm = randperm(length(IMAGES))
    trials = make_trials(;perm)
    trials.main_revealed[1].rewards
    parameters = (;
        images = IMAGES[perm],
    )

    write("$dest/$i.json", json((;parameters, trials)))
    println("$dest/$i.json")
end
